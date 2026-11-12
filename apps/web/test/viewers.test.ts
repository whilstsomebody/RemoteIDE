import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/components/viewers/markdown-viewer";
import { parseCsv } from "../src/components/viewers/csv-viewer";
import { formatHexDump } from "../src/components/viewers/binary-viewer";

describe("Special Viewers Data Parsers", () => {
  describe("parseMarkdown", () => {
    it("parses headings of multiple levels", () => {
      const md = `# Title\n\n## Subtitle\n\n### Section`;
      const blocks = parseMarkdown(md);

      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Title" });
      expect(blocks[1]).toEqual({ type: "heading", level: 2, text: "Subtitle" });
      expect(blocks[2]).toEqual({ type: "heading", level: 3, text: "Section" });
    });

    it("parses fenced code blocks with language specifiers", () => {
      const md = "```typescript\nconst a: number = 42;\nconsole.log(a);\n```";
      const blocks = parseMarkdown(md);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.type).toBe("code");
      expect(blocks[0]?.lang).toBe("typescript");
      expect(blocks[0]?.text).toBe("const a: number = 42;\nconsole.log(a);");
    });

    it("parses blockquotes and horizontal rules", () => {
      const md = "> This is a note\n\n---";
      const blocks = parseMarkdown(md);

      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.type).toBe("blockquote");
      expect(blocks[0]?.text).toBe("This is a note");
      expect(blocks[1]?.type).toBe("hr");
    });

    it("parses tables with headers and rows", () => {
      const md = `| Col A | Col B |\n| --- | --- |\n| Val 1 | Val 2 |\n| Val 3 | Val 4 |`;
      const blocks = parseMarkdown(md);

      expect(blocks).toHaveLength(1);
      const table = blocks[0];
      expect(table?.type).toBe("table");
      expect(table?.headers).toEqual(["Col A", "Col B"]);
      expect(table?.rows).toEqual([
        ["Val 1", "Val 2"],
        ["Val 3", "Val 4"],
      ]);
    });

    it("parses unordered and task list items", () => {
      const md = `- [x] Complete task\n- [ ] Pending task\n- Normal bullet`;
      const blocks = parseMarkdown(md);

      expect(blocks).toHaveLength(1);
      const list = blocks[0];
      expect(list?.type).toBe("list");
      expect(list?.ordered).toBe(false);
      expect(list?.items).toEqual([
        { text: "Complete task", checked: true },
        { text: "Pending task", checked: false },
        { text: "Normal bullet" },
      ]);
    });
  });

  describe("parseCsv", () => {
    it("parses standard comma-separated values", () => {
      const csv = `id,name,role\n1,Alice,Admin\n2,Bob,Developer`;
      const parsed = parseCsv(csv);

      expect(parsed.headers).toEqual(["id", "name", "role"]);
      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0]).toEqual(["1", "Alice", "Admin"]);
      expect(parsed.rows[1]).toEqual(["2", "Bob", "Developer"]);
    });

    it("handles quoted cells containing commas and escaped quotes", () => {
      const csv = `title,description\n"RemoteIDE","A secure, local-first ""IDE"""\n"Next.js","React framework"`;
      const parsed = parseCsv(csv);

      expect(parsed.headers).toEqual(["title", "description"]);
      expect(parsed.rows[0]).toEqual(["RemoteIDE", 'A secure, local-first "IDE"']);
      expect(parsed.rows[1]).toEqual(["Next.js", "React framework"]);
    });

    it("handles tab-separated values (TSV)", () => {
      const tsv = `col1\tcol2\nval1\tval2`;
      const parsed = parseCsv(tsv);

      expect(parsed.headers).toEqual(["col1", "col2"]);
      expect(parsed.rows[0]).toEqual(["val1", "val2"]);
    });

    it("returns empty arrays for empty content", () => {
      expect(parseCsv("")).toEqual({ headers: [], rows: [] });
      expect(parseCsv("   \n  ")).toEqual({ headers: [], rows: [] });
    });
  });

  describe("formatHexDump", () => {
    it("formats base64 binary payload into formatted hex offsets and ascii", () => {
      // "Hello World! 123" in base64: SGVsbG8gV29ybGQhIDEyMw==
      const base64 = btoa("Hello World! 123");
      const dump = formatHexDump(base64);

      expect(dump.length).toBeGreaterThan(0);
      expect(dump[0]).toContain("00000000");
      expect(dump[0]).toContain("Hello World! 123");
    });

    it("handles empty base64 string", () => {
      expect(formatHexDump("")).toEqual([]);
    });
  });
});
