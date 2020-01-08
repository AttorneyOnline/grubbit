import Dexie from 'dexie';
import JSZip from 'jszip';
import mime from 'mime-types';

const db = new Dexie('assets');
db.version(1).stores({
  assets: '&hash, *packages',
  packages: '&id, acquiredAt'
});
db.open();

async function deletePackage(packageId) {
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

// Checks if string is a URL.
function isURL(str) {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

// Gets a dictionary of files from a zip file, where the key is the path and the
// value is the data (as a function that can be called extract() on).
async function extractZip(data) {
  const zip = await JSZip.loadAsync(data);
  return Object.assign({}, ...Object.entries(zip.files)
    .map(([file, zipObj]) => ({
      [file]: { extract: () => zipObj.async('arraybuffer') }
    }))
  );
}

// Gets the MIME type of a file based on its filename.
function getMimeType(filename) {
  return mime.lookup(filename);
}

let repositories = [
  'https://assets.animatedchatroom.net'
];

async function resolvePackageUrl(packageId) {
  // Send OPTIONS to all repos in parallel, then select the first one that
  // responds OK.
  // TODO: We may wish to wait for higher-priority repos even if a lower-priority
  // repo finishes earlier. High-priority repos may be backed by a CDN and
  // therefore yield faster download times, even if their initial response times
  // are worse.
  return await new Promise((resolve, reject) => {
    let pending = repositories.length;
    repositories.map((repo) => {
      const url = `${repo}/${packageId}.zip`;
      fetch(url, { method: 'OPTIONS' })
        .then(_res => resolve(url))
        .catch(() => {
          if (--pending === 0)
            reject(`No repositories contain package ${packageId}`);
        });
    });
  });
}

async function fetchPackage(packageId) {
  return await resolvePackageUrl(packageId)
    .then(url => fetch(url))
    .then(res => res.blob());
}

async function installPackage(packageId) {
  if (await db.packages.get(packageId))
    return;

  const files = await extractZip(await fetchPackage(packageId));

  const decoder = new TextDecoder();
  const manifest = JSON.parse(
    decoder.decode(await files['asset.json'].extract())
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
        type: getMimeType(filename),
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
async function getAsset(asset, online = false) {
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

  if (!asset.startsWith('@')) {
    // Local resources only matter in desktop, so we'll ignore that.
    throw new Error('Local resources are not allowed');
  }

  const [packageId, resourceId] = asset.substring(1).split('/');
  let resource = await db.assets.get(resourceId);
  if (!resource) {
    // Cache miss - fetch from suggested package
    if (!online) return null;
    await installPackage(packageId);
    resource = await db.assets.get(resourceId);
    if (!resource) {
      throw new Error(`Could not find asset ${asset}, even from suggested package`);
    }
  }

  return new Blob([resource.data], {type: resource.type});
}

export { getAsset, repositories };