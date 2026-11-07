import { test } from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders } from "../src/placeholders.js";

test("fills {{char}} and {{user}} in any case and leaves unknown tokens alone", () => {
  const names = { char: "Akari", user: "Kai" };
  assert.equal(
    fillPlaceholders("uhmm, hello {{user}}, welcome to my house. I'm {{ CHAR }}.", names),
    "uhmm, hello Kai, welcome to my house. I'm Akari.",
  );
  assert.equal(fillPlaceholders("{{mood}} stays", names), "{{mood}} stays");
});
