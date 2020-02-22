import { AssetDB } from '../lib/asset';

const webFetch = window.fetch;
import fetchMock from 'fetch-mock';

const REPO = 'https://mock-assets.website';
const BASE = 'https://legacy-assets.website';
const BROKEN = 'https://broken.website';

function mockFixture(urlPrefix, fixtureDir) {
  return async (url, options) => {
    const resource = url.substring(urlPrefix.length + 1);
    return await webFetch(
      `base/test/fixtures/${fixtureDir}/${resource}`,
      options
    );
  };
}

fetchMock
  .mock(`begin:${REPO}`, mockFixture(REPO, 'pkgs'))
  .mock(`begin:${BASE}`, mockFixture(BASE, 'base'))
  .mock(`begin:${BROKEN}`, { status: 404 });

describe('environment', () => {
  it('should fetch a sample fixture', async () => {
    expect(await webFetch('base/test/fixtures/test.txt')
      .then(res => res.text())).toBe('Hello world');
  });
});

describe('asset system', () => {
  let assets;
  beforeAll(async () => {
    assets = new AssetDB('assets', {
      repos: [REPO, BROKEN],
      virtualBase: [BROKEN, BASE]
    }); 
    assets.clearAll();
  });

  it('downloads a remote resource', async () => {
    const res = await assets.getAsset(`${BASE}/banana.gif`);
    expect(res.type).toBe('image/gif');
  });

  it('downloads an asset with hashes', async () => {
    const pkg = '3e12c59c966cf442008eb43053183f15d3480499';
    const file = 'd3e61a0597ff455ce63299993882318073371f81';
    const res = await assets.getAsset(`@${pkg}/${file}`);
    expect(res.type).toBe('image/gif');
  });

  it('downloads an asset with virtual base', async () => {
    const file = 'banana.gif';
    const res = await assets.getAsset(file);
    expect(res.type).toBe('image/gif');
  });
});
