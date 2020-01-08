import { getAsset } from '../lib/asset';

const webFetch = window.fetch;
import fetchMock from 'fetch-mock';

const BASE = 'https://assets.animatedchatroom.net';
fetchMock.mock(`begin:${BASE}`,
  async (url, options) => {
    const resource = url.substring(BASE.length + 1);
    return await webFetch(`base/test/fixtures/${resource}`, options);
  });

describe('environment', () => {
  it('should fetch a sample fixture', async () => {
    expect(await webFetch('base/test/fixtures/test.txt')
      .then(res => res.text())).toBe('Hello world');
  });
});

describe('asset system', () => {
  it('downloads a remote resource', async () => {
    const res = await getAsset(`${BASE}/banana.gif`, true);
    expect(res.type).toBe('image/gif');
  });

  it('downloads an asset', async () => {
    const pkg = '3e12c59c966cf442008eb43053183f15d3480499';
    const file = 'd3e61a0597ff455ce63299993882318073371f81';
    const res = await getAsset(`@${pkg}/${file}`, true);
    expect(res.type).toBe('image/gif');
  })
});
