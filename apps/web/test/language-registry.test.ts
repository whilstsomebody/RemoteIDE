import { describe, it, expect } from "vitest";
import {
  getLanguageDefinition,
  getAllLanguages,
  LANGUAGE_REGISTRY,
} from "../src/lib/editor/language-registry";

describe("Language Registry", () => {
  it("resolves TypeScript for .ts and .tsx files", () => {
    const tsLang = getLanguageDefinition("src/index.ts");
    expect(tsLang.id).toBe("typescript");
    expect(tsLang.name).toBe("TypeScript");

    const tsxLang = getLanguageDefinition("src/components/App.tsx");
    expect(tsxLang.id).toBe("typescriptreact");
    expect(tsxLang.name).toBe("TypeScript JSX");
  });

  it("resolves JavaScript and JSX files", () => {
    const jsLang = getLanguageDefinition("utils/helper.js");
    expect(jsLang.id).toBe("javascript");

    const jsxLang = getLanguageDefinition("components/Button.jsx");
    expect(jsxLang.id).toBe("javascriptreact");
  });

  it("resolves JSON and Markdown with special viewer tags", () => {
    const jsonLang = getLanguageDefinition("package.json");
    expect(jsonLang.id).toBe("json");
    expect(jsonLang.specialViewer).toBe("json");

    const mdLang = getLanguageDefinition("docs/README.md");
    expect(mdLang.id).toBe("markdown");
    expect(mdLang.specialViewer).toBe("markdown");
  });

  it("resolves systems and backend languages (Python, Rust, Go, C++, Java)", () => {
    expect(getLanguageDefinition("main.py").id).toBe("python");
    expect(getLanguageDefinition("src/main.rs").id).toBe("rust");
    expect(getLanguageDefinition("server.go").id).toBe("go");
    expect(getLanguageDefinition("engine.cpp").id).toBe("cpp");
    expect(getLanguageDefinition("Service.java").id).toBe("java");
  });

  it("resolves config, web, and data formats (HTML, CSS, SQL, YAML, XML, CSV)", () => {
    expect(getLanguageDefinition("index.html").id).toBe("html");
    expect(getLanguageDefinition("styles.css").id).toBe("css");
    expect(getLanguageDefinition("query.sql").id).toBe("sql");
    expect(getLanguageDefinition("config.yaml").id).toBe("yaml");
    expect(getLanguageDefinition("feed.xml").id).toBe("xml");
    expect(getLanguageDefinition("data.csv").specialViewer).toBe("csv");
  });

  it("resolves exact filenames such as Dockerfile and .bashrc", () => {
    expect(getLanguageDefinition("Dockerfile").id).toBe("dockerfile");
    expect(getLanguageDefinition(".bashrc").id).toBe("shell");
  });

  it("identifies binary files and images", () => {
    expect(getLanguageDefinition("assets/logo.png").specialViewer).toBe("image");
    expect(getLanguageDefinition("binary.wasm").specialViewer).toBe("binary");
    expect(getLanguageDefinition("archive.tar.gz").specialViewer).toBe("binary");
  });

  it("falls back to plain text for unknown extensions", () => {
    const unknown = getLanguageDefinition("unknown.xyz123");
    expect(unknown.id).toBe("plaintext");
    expect(unknown.name).toBe("Plain Text");
  });

  it("exports a non-empty language registry list", () => {
    const all = getAllLanguages();
    expect(all.length).toBeGreaterThan(15);
    expect(all).toEqual(LANGUAGE_REGISTRY);
  });
});

