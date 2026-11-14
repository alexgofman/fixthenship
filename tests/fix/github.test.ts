import { describe, expect, it } from "vitest";
import { gitHubRepoUrl, parseRepoUrl } from "../../lib/fix/github";

describe("parseRepoUrl", () => {
  it.each([
    ["https://github.com/o/r", "o", "r"],
    ["https://github.com/o/r.git", "o", "r"],
    ["https://github.com/o/r/", "o", "r"],
    ["https://github.com/o/r.git/", "o", "r"],
    ["https://github.com/o/r/tree/main", "o", "r"],
    ["https://github.com/o/r/tree/feature/x", "o", "r"],
    ["  https://GitHub.com/my-org/my.app  ", "my-org", "my.app"],
  ])("reads %j", (url, owner, repo) => {
    expect(parseRepoUrl(url)).toEqual({ owner, repo });
  });

  it.each([
    "https://evil.example/github.com/o/r",
    "https://github.com.evil.example/o/r",
    "http://github.com/o/r",
    "git@github.com:o/r.git",
    "github.com/o/r",
    "https://github.com/o",
    "https://github.com/o/r/pulls",
    "https://github.com/o/r?x=1",
    "https://github.com/o/..",
    "https://user@github.com/o/r",
    "",
  ])("refuses %j", (url) => {
    expect(() => parseRepoUrl(url)).toThrow(/Not a GitHub repository URL/);
  });
});

describe("gitHubRepoUrl", () => {
  it.each([
    ["https://github.com/o/r", "https://github.com/o/r"],
    ["http://www.github.com/o/r.git/", "https://github.com/o/r"],
    ["https://github.com/o/r/tree/main/app", "https://github.com/o/r"],
    ["https://github.com/o/r#readme", "https://github.com/o/r"],
  ])("cleans %j", (value, clean) => {
    expect(gitHubRepoUrl(value)).toBe(clean);
    expect(parseRepoUrl(clean)).toEqual({ owner: "o", repo: "r" });
  });

  it.each(["https://evil.example/github.com/o/r", "-uhttps://github.com/o/r", "file:///github.com/o/r"])(
    "refuses %j",
    (value) => {
      expect(gitHubRepoUrl(value)).toBeNull();
    },
  );
});
