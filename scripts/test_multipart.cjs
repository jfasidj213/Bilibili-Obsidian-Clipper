const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
const context = vm.createContext({ URL, console, location: { href: 'https://www.bilibili.com/video/BVtest/?p=2' } });
vm.runInContext(source.replace(/^init\(\);$/m, ''), context);
const run = code => vm.runInContext(code, context);

async function main() {
  run(`globalThis.fixture = {
    title: '课程', aid: '10', defaultCid: '101', defaultDuration: 100,
    pages: [{page: 1, cid: '101', part: '第一课', duration: 100},
            {page: 2, cid: '102', part: '第二课', duration: 100},
            {page: 3, cid: '103', part: '第三课', duration: 100}]
  }; fetchVideoMeta = async () => fixture;`);
  const list = await run('getBatchList()');
  assert.equal(list.type, 'multi_p');
  assert.equal(list.items.length, 3);
  assert.equal(list.items[1].cid, '102');
  assert.equal(list.items[1].url, 'https://www.bilibili.com/video/BVtest/?p=2');
  assert.equal(run('pickPageFromPages(fixture.pages, 9)'), null);
  assert.throws(() => run('pickCidFromPages(fixture.pages, 9, "101")'));
  assert.equal(run('extractPageIndex("https://www.bilibili.com/video/BVtest/?p=1.5")'), 0);
  assert.notEqual(run('computeCurrentClipSignature("https://www.bilibili.com/list/watchlater?bvid=BVtest&oid=101")'),
    run('computeCurrentClipSignature("https://www.bilibili.com/list/watchlater?bvid=BVtest&oid=102")'));
  run('state.bvid = "BVtest"; state.pageIndex = 2;');
  assert.equal(run('cleanVideoUrl("https://www.bilibili.com/list/watchlater?bvid=BVtest&oid=102")'), list.items[1].url);
  run('globalThis.list = null'); context.list = list;
  run('startBatchSession(list, [list.items[0], list.items[2]])');
  assert.equal(run('getBatchState().items[1].cid'), '103');
  run(`fetchSubtitleBundle = async (bvid, cid) => ({ tracks: [{id: cid, lan: 'zh-CN', lanDoc: '中文', subtitleUrl: 'https://example.com/' + cid}], chapters: [] });
    fetchSubtitleBody = async url => ({body: [{from: 0, to: 100, content: url}]});`);
  const result = await run('fetchBatchItemSubtitle(list.items[2])');
  assert.equal(result.item.cid, '103');
  assert.match(result.subtitleBody[0].content, /103/);
  context.result = result;
  const markdown = run('buildBatchMarkdown(list, [result, {item: list.items[0], error: "no-subtitle"}, {item: list.items[1], error: "网络失败"}], {tags: "test", includeTimestampInBody: true})');
  assert.match(markdown, /P3 第三课/);
  assert.match(markdown, /暂无可用字幕/);
  assert.match(markdown, /抓取失败：网络失败/);
  run('fetchSubtitleBody = async () => ({body: [{from: 0, to: 1000, content: "wrong"}]})');
  await assert.rejects(run('fetchBatchItemSubtitle(list.items[0])'), /不匹配/);
  run('fetchSubtitleBundle = async () => ({tracks: [], chapters: []})');
  assert.equal((await run('fetchBatchItemSubtitle(list.items[0])')).error, 'no-subtitle');
  run('checkObsidianNoteExists = async () => true; writeNoteByLocalApi = async () => { throw new Error("unexpected write") }');
  await assert.rejects(run('batchSaveToObsidian(list, [result], {obsidianApiBaseUrl: "http://localhost", obsidianApiKey: "test"})'), /未覆盖/);
  run('state.fetchRunId = 5; state.currentClipSignature = computeCurrentClipSignature()');
  context.location.href = 'https://www.bilibili.com/video/BVtest/?p=3';
  assert.throws(() => run('ensureRunActive(5)'), /Stale/);
  run('resetBatchState()');
  assert.equal(run('getBatchState().active'), false);
  console.log('Multipart regression checks passed. No browser, network or vault writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
