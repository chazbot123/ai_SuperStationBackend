const assert = require("node:assert/strict");
const { parseArgs } = require("./debug-douyin-image-flow.cjs");

function testParsesWhitespaceSeparatedTags() {
  const options = parseArgs(["--tags=露营 好物 #相机"]);
  assert.deepEqual(options.tags, ["露营", "好物", "相机"]);
}

function testParsesMixedCommaAndWhitespaceSeparatedTags() {
  const options = parseArgs(["--tags=露营,好物  相机,#测评"]);
  assert.deepEqual(options.tags, ["露营", "好物", "相机", "测评"]);
}

function main() {
  testParsesWhitespaceSeparatedTags();
  testParsesMixedCommaAndWhitespaceSeparatedTags();
  console.log("debug-douyin-image-flow tag parsing tests passed");
}

main();
