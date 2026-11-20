import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  CreateDatabaseProfileDtoSchema,
  SqlQueryDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import {
  DatabaseExplorerService,
  databaseExplorerService,
} from "../services/database/database-explorer.service.js";

export const databaseRoutes: FastifyPluginAsync<{
  databaseService?: DatabaseExplorerService;
}> = async (fastify, opts) => {
  const service = opts.databaseService || databaseExplorerService;

  // List Profiles
  fastify.get("/api/v1/database/profiles", async () => {
    const profiles = service.listProfiles();
    return createSuccessResponse(profiles);
  });

  // Create Profile
  fastify.post<{
    Body: unknown;
  }>("/api/v1/database/profiles", async (request) => {
    const val = CreateDatabaseProfileDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid database profile parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }

    const profile = service.createProfile(val.data);
    return createSuccessResponse(profile);
  });

  // Delete Profile
  fastify.delete<{
    Params: { id: string };
  }>("/api/v1/database/profiles/:id", async (request) => {
    const deleted = service.deleteProfile(request.params.id);
    if (!deleted) {
      throw new AppError(ErrorCode.NOT_FOUND, `Database profile ${request.params.id} not found`);
    }
    return createSuccessResponse({ deleted: true, id: request.params.id });
  });

  // Test Profile Connection
  fastify.post<{
    Params: { id: string };
  }>("/api/v1/database/profiles/:id/test", async (request) => {
    const result = await service.testConnection(request.params.id);
    return createSuccessResponse(result);
  });

  // List Tables and Schemas
  fastify.get<{
    Params: { id: string };
  }>("/api/v1/database/profiles/:id/tables", async (request) => {
    const tables = await service.listTables(request.params.id);
    return createSuccessResponse(tables);
  });

  // Get Paginated Table Data
  fastify.get<{
    Params: { id: string; tableName: string };
    Querystring: { page?: string; pageSize?: string };
  }>("/api/v1/database/profiles/:id/tables/:tableName/data", async (request) => {
    const page = request.query.page ? parseInt(request.query.page, 10) : 1;
    const pageSize = request.query.pageSize ? parseInt(request.query.pageSize, 10) : 50;

    const data = await service.getTableData(
      request.params.id,
      request.params.tableName,
      page,
      pageSize
    );
    return createSuccessResponse(data);
  });

  // Execute Read-Only SQL Query
  fastify.post<{
    Body: unknown;
  }>("/api/v1/database/query", async (request) => {
    const val = SqlQueryDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid SQL query parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }

    const result = await service.runQuery(val.data);
    return createSuccessResponse(result);
  });
};
