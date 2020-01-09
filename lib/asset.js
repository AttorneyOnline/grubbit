import Dexie from 'dexie';
import JSZip from 'jszip';
import mime from 'mime-types';
import { isURL } from './util';

// Gets a dictionary of files from a zip file, where the key is the path and the
// value is the data (as a function that can be called extract() on).
async function extractZip(data) {
  const zip = await JSZip.loadAsync(data);
  return Object.assign({}, ...Object.entries(zip.files)
    .map(([file, zipObj]) => ({
      [file]: {
        extract: () => zipObj.async('blob'),
        extractText: () => zipObj.async('text')
      }
    }))
  );
}

async function resolvePackageUrl(packageId, repos) {
  // Send OPTIONS to all repos in parallel, then select the first one that
  // responds OK.
  // TODO: We may wish to wait for higher-priority repos even if a lower-priority
  // repo finishes earlier. High-priority repos may be backed by a CDN and
  // therefore yield faster download times, even if their initial response times
  // are worse.
  return await new Promise((resolve, reject) => {
    let pending = repos.length;
    repos.map((repo) => {
      const url = `${repo}/${packageId}.zip`;
      fetch(url, { method: 'OPTIONS' })
        .then((res) => {
          if (res.status !== 200)
            throw new Error();
          resolve(url);
        })
        .catch(() => {
          if (--pending === 0)
            reject(`No repositories contain package ${packageId}`);
        });
    });
  });
}

const DEFAULT_REPOS = [
  'https://assets.animatedchatroom.net'
];

export class AssetDB {
  constructor(dbName, {repos = DEFAULT_REPOS, virtualBase = undefined} = {}) {
    const db = new Dexie(dbName);
    db.version(1).stores({
      assets: '&hash, *packages',
      packages: '&id, acquiredAt'
    });
    db.open();

    this._db = db;
    this._repos = repos;
    this._virtualBase = virtualBase;

    if (virtualBase && !isURL(virtualBase)) {
      throw new Error('Virtual base must be a valid URL');
    }
  }

  async clearAll() {
    const db = this._db;
    await Promise.all([
      db.assets.clear(),
      db.packages.clear()
    ]);
  }

  async fetchPackage(packageId) {
    return await resolvePackageUrl(packageId, this._repos)
      .then(url => fetch(url))
      .then(res => res.blob());
  }

  async installPackage(packageId) {
    const db = this._db;
    if (await db.packages.get(packageId))
      return;

    const files = await extractZip(await this.fetchPackage(packageId));

    const manifest = JSON.parse(
      await files['asset.json'].extractText()
    );

    if (manifest.parent)
      await installPackage(manifest.parent);

    for (const filename in manifest.files) {
      const hash = manifest.files[filename];
      const asset = await db.assets.get(hash);
      if (asset) {
        asset.packages.push(packageId);
      } else {
        await db.assets.put({
          hash,
          data: await files[filename].extract(),
          type: mime.lookup(filename),
          packages: [packageId]
        });
      }
    }

    await db.packages.put({
      id: packageId,
      acquiredAt: new Date(),
      ...manifest
    });

    console.log(`Installed new package "${manifest.name}"`);
  }

  /**
    * Resolves the local path to an asset based on an asset ID.
    *
    * An asset ID may either take various formats:
    * - Reference to local resource:
    *     `my_local_resource/sprites/my_sprite.webp`
    *
    * - Reference to hash of file in package:
    *     `@0123abcd/4567afaf`
    *   Note that if the package (or file) cannot be found, if the same file
    *   cannot be found in another installed package, then a suggestion
    *   may be made to the user to automatically download the referenced
    *   package.
    *
    * - Reference to remote resource:
    *     `https://example.com/assets/hello_world.webp`
    *   This type of reference is not recommended due to high overhead incurred
    *   from cache misses (since the client cannot know ahead of time what it must
    *   download).
    *
    * If the asset cannot be found locally, then an attempt will be made to fetch
    * it over the Internet (if `online` is true).
    * 
    * @param {string} asset  Asset ID
    * @param {boolean} online  Fetch missing data from the Internet
    * @returns {Promise<Blob>} a file-like view of the asset data
    */
  async getAsset(asset, online = false) {
    if (!asset.startsWith('@') && !isURL(asset) && this._virtualBase) {
      // Use "virtual base" to fetch assets by path
      asset = `${this._virtualBase}/${asset}`;
    }

    // Start with the easiest case: URLs.
    if (isURL(asset)) {
      if (online) {
        // For browsers, we'll use fetch here, since the browser is already
        // great at caching for us.
        const res = await fetch(asset);
        if (res.status !== 200)
          throw new Error(`Could not fetch asset ${asset}`);

        return await res.blob();
      } else {
        // No idea if the asset is in cache or not.
        return null;
      }
    }

    const [packageId, resourceId] = asset.substring(1).split('/');
    const db = this._db;
    let resource = await db.assets.get(resourceId);
    if (!resource) {
      // Cache miss - fetch from suggested package
      if (!online) return null;
      await this.installPackage(packageId);
      resource = await db.assets.get(resourceId);
      if (!resource) {
        throw new Error(`Could not find asset ${asset}, even from suggested package`);
      }
    }

    return new Blob([resource.data], {type: resource.type});
  }

  async deletePackage(packageId) {
    const db = this._db;
    const pkg = db.packages.get(packageId);
    for (const hash in Object.values(pkg.files)) {
      const asset = await db.assets.get(hash);
      if (!asset) continue;
      asset.packages.splice(asset.packages.indexOf(packageId), 1);
      if (asset.packages.length === 0)
        await db.assets.delete(hash);
    }
    await db.packages.delete(packageId);
  }
}
