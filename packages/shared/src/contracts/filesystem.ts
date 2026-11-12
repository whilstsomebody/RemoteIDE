import { z } from "zod";

export type FileType = "file" | "directory" | "symlink";

export const FileTypeSchema = z.enum(["file", "directory", "symlink"]);

export interface FileNode {
  name: string;
  path: string; // relative to workspace folder
  type: FileType;
  size?: number;
  mtime?: string;
  isBinary?: boolean;
  isSymlink?: boolean;
  children?: FileNode[];
}

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: FileTypeSchema,
    size: z.number().int().nonnegative().optional(),
    mtime: z.string().optional(),
    isBinary: z.boolean().optional(),
    isSymlink: z.boolean().optional(),
    children: z.array(FileNodeSchema).optional(),
  })
);

export const FileStatSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
  mtime: z.string(),
  ctime: z.string(),
  mode: z.number(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
  isSymlink: z.boolean(),
  isBinary: z.boolean(),
  eTag: z.string(),
});

export type FileStat = z.infer<typeof FileStatSchema>;

export const ReadFileResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]),
  eTag: z.string(),
  size: z.number().int().nonnegative(),
  isBinary: z.boolean(),
  mtime: z.string(),
});

export type ReadFileResponse = z.infer<typeof ReadFileResponseSchema>;

export const WriteFileDtoSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
  expectedETag: z.string().optional(),
  createParents: z.boolean().default(true),
});

export type WriteFileDto = z.infer<typeof WriteFileDtoSchema>;

export const WriteFileResponseSchema = z.object({
  path: z.string(),
  size: z.number().int().nonnegative(),
  eTag: z.string(),
  mtime: z.string(),
});

export type WriteFileResponse = z.infer<typeof WriteFileResponseSchema>;

export const CreateFileDtoSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["file", "directory"]),
  initialContent: z.string().optional(),
});

export type CreateFileDto = z.infer<typeof CreateFileDtoSchema>;

export const MoveFileDtoSchema = z.object({
  fromPath: z.string().min(1),
  toPath: z.string().min(1),
  overwrite: z.boolean().default(false),
});

export type MoveFileDto = z.infer<typeof MoveFileDtoSchema>;

export const DeleteFileDtoSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
});

export type DeleteFileDto = z.infer<typeof DeleteFileDtoSchema>;

export const SearchFilesDtoSchema = z.object({
  query: z.string().min(1),
  type: z.enum(["filename", "content"]).default("filename"),
  isRegex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().positive().default(50),
});

export type SearchFilesDto = z.infer<typeof SearchFilesDtoSchema>;

export const SearchResultItemSchema = z.object({
  path: z.string(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  match: z.string(),
  preview: z.string().optional(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchFilesResponseSchema = z.object({
  query: z.string(),
  totalMatches: z.number().int().nonnegative(),
  results: z.array(SearchResultItemSchema),
});

export type SearchFilesResponse = z.infer<typeof SearchFilesResponseSchema>;

export const FsChangeOperationSchema = z.enum(["create", "update", "delete", "rename"]);
export type FsChangeOperation = z.infer<typeof FsChangeOperationSchema>;

export const FsJournalEntrySchema = z.object({
  sequenceNumber: z.number().int().positive(),
  eventId: z.string(),
  workspaceId: z.string(),
  relativePath: z.string(),
  operationType: FsChangeOperationSchema,
  timestamp: z.string(),
  fileVersion: z.string().nullable().optional(),
  status: z.enum(["pending", "delivered", "synced"]),
  metadata: z.record(z.unknown()).optional(),
});

export type FsJournalEntry = z.infer<typeof FsJournalEntrySchema>;
