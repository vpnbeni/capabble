/*
 * A school's uploaded files on Cloudinary.
 *
 * Uploads are not kept in one folder per school (many folders are shared, e.g. `answer-sheets`),
 * so a school's files are found the reliable way: every Cloudinary URL stored anywhere in its
 * database. The same walk rewrites URLs after a re-import uploads the files again.
 */
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const URL_PATTERN = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>()\\]+/g;
const TRANSFORMATION_SEGMENT = /^([a-z]{1,3}_[^/]*|[^/]*,[^/]*)$/;
const DELETE_BATCH = 100;

const cloudinary = () => {
  // eslint-disable-next-line global-require
  const { cloudinary: client } = require('../../config/cloudinary');
  return client;
};

/**
 * https://res.cloudinary.com/<cloud>/<image|raw|video>/<upload|private|authenticated>/[transforms/][v123/]<public id>
 * Images and videos drop the extension from the public id; raw files keep it.
 */
const parseCloudinaryUrl = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== 'res.cloudinary.com') return null;
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 4) return null;
  const [cloudName, resourceType, type, ...rest] = parts;
  if (!['image', 'raw', 'video'].includes(resourceType)) return null;
  if (!['upload', 'private', 'authenticated'].includes(type)) return null;

  let index = 0;
  // Signed URLs carry s--xxxx--; transformations come before the version.
  if (/^s--.+--$/.test(rest[index] || '')) index += 1;
  const versionAt = rest.findIndex((segment, i) => i >= index && /^v\d+$/.test(segment));
  let version = null;
  if (versionAt >= 0) {
    version = rest[versionAt].slice(1);
    index = versionAt + 1;
  } else {
    while (index < rest.length - 1 && TRANSFORMATION_SEGMENT.test(rest[index])) index += 1;
  }
  const idPath = rest.slice(index).join('/');
  if (!idPath) return null;

  const dot = idPath.lastIndexOf('.');
  const hasExt = dot > idPath.lastIndexOf('/') && dot > 0;
  const format = hasExt ? idPath.slice(dot + 1).toLowerCase() : '';
  const publicId = resourceType === 'raw' || !hasExt ? idPath : idPath.slice(0, dot);
  return {
    url: `${url.origin}${url.pathname}`, cloudName, resourceType, type, version, publicId, format
  };
};

const isPlainObject = (value) => value && typeof value === 'object'
  && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);

/** Calls visit(string) for every string inside a document. */
const eachString = (value, visit) => {
  if (typeof value === 'string') {
    visit(value);
    return;
  }
  if (!isPlainObject(value)) return;
  Object.values(value).forEach((child) => eachString(child, visit));
};

const urlsInString = (text) => (text.includes('res.cloudinary.com') ? text.match(URL_PATTERN) || [] : []);

/**
 * Every Cloudinary file referenced in a database (native driver Db).
 * @returns {Promise<Map<string, object>>} key `${resourceType}/${type}/${publicId}` → file info + urls
 */
const collectFiles = async (db, { cloudName = process.env.CLOUDINARY_CLOUD_NAME } = {}) => {
  const files = new Map();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  // eslint-disable-next-line no-restricted-syntax
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue; // eslint-disable-line no-continue
    const cursor = db.collection(name).find({});
    // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
    for await (const doc of cursor) {
      eachString(doc, (text) => urlsInString(text).forEach((found) => {
        const info = parseCloudinaryUrl(found);
        if (!info || (cloudName && info.cloudName !== cloudName)) return;
        const key = `${info.resourceType}/${info.type}/${info.publicId}`;
        const entry = files.get(key) || { ...info, key, urls: new Set(), collections: new Set() };
        entry.urls.add(found);
        entry.collections.add(name);
        files.set(key, entry);
      }));
    }
  }
  return files;
};

const downloadTo = async (url, file) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
  return (await fs.promises.stat(file)).size;
};

/** Deletes files (entries from collectFiles), batched per resource type. Returns counts. */
const deleteFiles = async (entries) => {
  const groups = new Map();
  entries.forEach((entry) => {
    const group = `${entry.resourceType}|${entry.type}`;
    groups.set(group, [...(groups.get(group) || []), entry.publicId]);
  });
  let deleted = 0;
  let missing = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const [group, ids] of groups) {
    const [resourceType, type] = group.split('|');
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      // eslint-disable-next-line no-await-in-loop
      const out = await cloudinary().api.delete_resources(ids.slice(i, i + DELETE_BATCH), {
        resource_type: resourceType, type
      });
      const states = Object.values(out.deleted || {});
      const gone = states.filter((state) => state === 'deleted').length;
      deleted += gone;
      missing += states.length - gone;
    }
  }
  return { deleted, missing };
};

const fileExists = async ({ publicId, resourceType, type }) => {
  try {
    await cloudinary().api.resource(publicId, { resource_type: resourceType, type });
    return true;
  } catch (error) {
    const code = error?.error?.http_code || error?.http_code;
    if (code === 404) return false;
    throw error;
  }
};

/** Uploads a file under its old public id. Returns the new URL. */
const uploadAs = async (file, { publicId, resourceType, type }) => {
  const out = await cloudinary().uploader.upload(file, {
    public_id: publicId, resource_type: resourceType, type, overwrite: false, unique_filename: false
  });
  return out.secure_url;
};

/** Replaces old URLs with new ones everywhere in a database. Returns the number of documents changed. */
const rewriteUrls = async (db, mapping) => {
  if (!mapping.size) return 0;
  const replaceIn = (value) => {
    if (typeof value === 'string') {
      if (!value.includes('res.cloudinary.com')) return value;
      return value.replace(URL_PATTERN, (found) => mapping.get(found) || found);
    }
    if (Array.isArray(value)) return value.map(replaceIn);
    if (isPlainObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceIn(v)]));
    }
    return value;
  };
  let changed = 0;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  // eslint-disable-next-line no-restricted-syntax
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue; // eslint-disable-line no-continue
    // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
    for await (const doc of db.collection(name).find({})) {
      const set = {};
      Object.entries(doc).forEach(([field, value]) => {
        if (field === '_id') return;
        const next = replaceIn(value);
        if (JSON.stringify(next) !== JSON.stringify(value)) set[field] = next;
      });
      if (Object.keys(set).length) {
        // eslint-disable-next-line no-await-in-loop
        await db.collection(name).updateOne({ _id: doc._id }, { $set: set });
        changed += 1;
      }
    }
  }
  return changed;
};

module.exports = {
  parseCloudinaryUrl, collectFiles, downloadTo, deleteFiles, fileExists, uploadAs, rewriteUrls, eachString
};
