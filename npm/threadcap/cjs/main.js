var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// https://raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap.ts
var threadcap_exports = {};
__export(threadcap_exports, {
  InMemoryCache: () => InMemoryCache,
  MAX_LEVELS: () => MAX_LEVELS,
  computeDefaultMillisToWait: () => computeDefaultMillisToWait,
  isValidProtocol: () => isValidProtocol,
  makeRateLimitedFetcher: () => makeRateLimitedFetcher,
  makeSigningAwareFetcher: () => makeSigningAwareFetcher,
  makeThreadcap: () => makeThreadcap,
  updateThreadcap: () => updateThreadcap
});
module.exports = __toCommonJS(threadcap_exports);

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/check.ts
function isNonEmpty(value) {
  return value.trim().length > 0;
}
function isStringRecord(obj) {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj) && obj.constructor === Object;
}
function isReadonlyArray(arg) {
  return Array.isArray(arg);
}
function isValidIso8601(text) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(text);
}

// https:/raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/bytes.ts
var _Bytes = class {
  constructor(bytes) {
    this._bytes = bytes;
    this.length = bytes.length;
  }
  array() {
    return this._bytes;
  }
  async sha1() {
    const hash = await cryptoSubtle().digest("SHA-1", this._bytes);
    return new _Bytes(new Uint8Array(hash));
  }
  concat(other) {
    const rt = new Uint8Array(this.length + other.length);
    rt.set(this._bytes);
    rt.set(other._bytes, this.length);
    return new _Bytes(rt);
  }
  async gitSha1Hex() {
    return (await _Bytes.ofUtf8(`blob ${this.length}\0`).concat(this).sha1()).hex();
  }
  async hmacSha1(key) {
    const cryptoKey = await cryptoSubtle().importKey("raw", key._bytes, { name: "HMAC", hash: "SHA-1" }, true, ["sign"]);
    const sig = await cryptoSubtle().sign("HMAC", cryptoKey, this._bytes);
    return new _Bytes(new Uint8Array(sig));
  }
  async sha256() {
    const hash = await cryptoSubtle().digest("SHA-256", this._bytes);
    return new _Bytes(new Uint8Array(hash));
  }
  async hmacSha256(key) {
    const cryptoKey = await cryptoSubtle().importKey("raw", key._bytes, { name: "HMAC", hash: "SHA-256" }, true, ["sign"]);
    const sig = await cryptoSubtle().sign("HMAC", cryptoKey, this._bytes);
    return new _Bytes(new Uint8Array(sig));
  }
  hex() {
    const a = Array.from(this._bytes);
    return a.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  static ofHex(hex) {
    if (hex === "") {
      return _Bytes.EMPTY;
    }
    return new _Bytes(new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))));
  }
  utf8() {
    return new TextDecoder().decode(this._bytes);
  }
  static ofUtf8(str) {
    return new _Bytes(new TextEncoder().encode(str));
  }
  base64() {
    return base64Encode(this._bytes);
  }
  static ofBase64(base64, opts = { urlSafe: false }) {
    return new _Bytes(base64Decode(base64, opts.urlSafe));
  }
  static async ofStream(stream) {
    const chunks = [];
    for await (const chunk2 of stream) {
      chunks.push(chunk2);
    }
    const len = chunks.reduce((prev, current) => prev + current.length, 0);
    const rt = new Uint8Array(len);
    let offset = 0;
    for (const chunk2 of chunks) {
      rt.set(chunk2, offset);
      offset += chunk2.length;
    }
    return new _Bytes(rt);
  }
  static formatSize(sizeInBytes) {
    const sign = sizeInBytes < 0 ? "-" : "";
    let size = Math.abs(sizeInBytes);
    if (size < 1024)
      return `${sign}${size}bytes`;
    size = size / 1024;
    if (size < 1024)
      return `${sign}${roundToOneDecimal(size)}kb`;
    size = size / 1024;
    return `${sign}${roundToOneDecimal(size)}mb`;
  }
};
var Bytes = _Bytes;
Bytes.EMPTY = new _Bytes(new Uint8Array(0));
function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}
function base64Encode(buf) {
  let string = "";
  buf.forEach((byte) => {
    string += String.fromCharCode(byte);
  });
  return btoa(string);
}
function base64Decode(str, urlSafe) {
  if (urlSafe)
    str = str.replace(/_/g, "/").replace(/-/g, "+");
  str = atob(str);
  const length = str.length, buf = new ArrayBuffer(length), bufView = new Uint8Array(buf);
  for (let i = 0; i < length; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return bufView;
}
function cryptoSubtle() {
  return crypto.subtle;
}

// https:/deno.land/std@0.220.1/encoding/_util.ts
var encoder = new TextEncoder();

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/crypto.ts
async function computeHttpSignatureHeaders(opts) {
  const { method, url, body, privateKey, keyId } = opts;
  const { pathname, hostname } = new URL(url);
  const digest = body ? `SHA-256=${(await Bytes.ofUtf8(body).sha256()).base64()}` : void 0;
  const date = new Date().toUTCString();
  const signed = {
    "(request-target)": `${method.toLowerCase()} ${pathname}`,
    host: hostname,
    date,
    ...digest ? { digest } : {}
  };
  const stringToSign = Object.entries(signed).map((v) => v.join(": ")).join("\n");
  const signatureBytes = await rsaSign(privateKey, Bytes.ofUtf8(stringToSign));
  const signature = `keyId="${keyId}",algorithm="rsa-sha256",headers="${Object.keys(signed).join(" ")}",signature="${signatureBytes.base64()}"`;
  return { signature, date, digest, stringToSign };
}
async function rsaSign(privateKey, data) {
  const buf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data.array());
  return new Bytes(new Uint8Array(buf));
}
async function importKeyFromPem(pemText, type) {
  pemText = pemText.trim();
  const typeUpper = type.toUpperCase();
  const b64 = pemText.substring(`-----BEGIN ${typeUpper} KEY-----`.length, pemText.length - `-----END ${typeUpper} KEY-----`.length).replaceAll(/\s+/g, "");
  const pemBytes = Bytes.ofBase64(b64);
  return await crypto.subtle.importKey(type === "private" ? "pkcs8" : "spki", pemBytes.array(), {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256"
  }, false, [type === "private" ? "sign" : "verify"]);
}
var DEFAULT_ALLOWED_SECONDS_IN_THE_PAST = 60 * 60 * 12;
var DEFAULT_ALLOWED_SECONDS_IN_THE_FUTURE = 60 * 60;

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap_implementation.ts
async function findOrFetchJson(url, after, fetcher, cache, opts) {
  const response = await findOrFetchTextResponse(url, after, fetcher, cache, opts);
  const { status, headers, bodyText } = response;
  if (status !== 200)
    throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
  const contentType = headers["content-type"] || "<none>";
  const foundJson = contentType.toLowerCase().includes("json") || contentType === "<none>" && bodyText.startsWith('{"');
  if (!foundJson)
    throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
  return JSON.parse(bodyText);
}
function destructureThreadcapUrl(url) {
  const m = /^(at:\/\/)([^/]+)(\/.*?)$/.exec(url);
  const tmpUrl = m ? `${m[1]}${m[2].replaceAll(":", "%3A")}${m[3]}` : void 0;
  const { protocol, hostname: tmpHostname, pathname, searchParams } = new URL(tmpUrl != null ? tmpUrl : url);
  const hostname = tmpUrl ? tmpHostname.replaceAll("%3A", ":") : tmpHostname;
  return { protocol, hostname, pathname, searchParams };
}
async function findOrFetchTextResponse(url, after, fetcher, cache, opts) {
  const existing = await cache.get(url, after);
  if (existing)
    return existing;
  const { accept, authorization } = opts;
  const headers = { accept };
  if (authorization)
    headers.authorization = authorization;
  const res = await fetcher(url, { headers });
  const response = {
    status: res.status,
    headers: objectFromEntries([...res.headers]),
    bodyText: await res.text()
  };
  await cache.put(url, new Date().toISOString(), response);
  return response;
}
function objectFromEntries(entries) {
  return [...entries].reduce((obj, [key, value]) => {
    obj[key] = value;
    return obj;
  }, {});
}

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap_activitypub.ts
var ActivityPubProtocolImplementation = {
  initThreadcap: initActivityPubThreadcap,
  fetchComment: fetchActivityPubComment,
  fetchCommenter: fetchActivityPubCommenter,
  fetchReplies: fetchActivityPubReplies
};
async function mastodonFindReplies(id, opts) {
  const { after, fetcher, cache, debug } = opts;
  const statusId = await mastodonFindStatusIdForActivityPubId(id, after, fetcher, cache, debug);
  if (!statusId)
    return [];
  const { origin } = new URL(id);
  const url = new URL(origin);
  url.pathname = `/api/v1/statuses/${statusId}/context`;
  const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, { accept: "application/json" });
  if (debug)
    console.log(JSON.stringify(obj, void 0, 2));
  const rt = [];
  if (isStringRecord(obj) && Array.isArray(obj.descendants)) {
    for (const descendant of obj.descendants) {
      if (isStringRecord(descendant) && typeof descendant.uri === "string" && descendant.in_reply_to_id === statusId) {
        rt.push(descendant.uri);
      }
    }
  }
  return rt;
}
async function findOrFetchActivityPubObject(url, after, fetcher, cache) {
  return await findOrFetchJson(url, after, fetcher, cache, { accept: "application/activity+json" });
}
async function initActivityPubThreadcap(url, opts) {
  const { fetcher, cache } = opts;
  const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
  const { id, type } = object;
  if (typeof type !== "string")
    throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
  if (!/^(Note|Article|Video|PodcastEpisode|Question)$/.test(type))
    throw new Error(`Unexpected type: ${type}`);
  if (typeof id !== "string")
    throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
  return { protocol: "activitypub", roots: [id], nodes: {}, commenters: {} };
}
async function fetchActivityPubComment(id, opts) {
  const { fetcher, cache, updateTime, callbacks } = opts;
  const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
  return computeComment(object, id, callbacks);
}
async function fetchActivityPubCommenter(attributedTo, opts) {
  const { fetcher, cache, updateTime } = opts;
  const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
  return computeCommenter(object, updateTime);
}
async function fetchActivityPubReplies(id, opts) {
  var _a;
  const { fetcher, cache, updateTime, callbacks, debug } = opts;
  const fetchedObject = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
  const object = unwrapActivityIfNecessary(fetchedObject, id, callbacks);
  const replies = object.type === "PodcastEpisode" ? object.comments : (_a = object.replies) != null ? _a : object.comments;
  if (replies === void 0) {
    let message = object.type === "PodcastEpisode" ? `No 'comments' found on PodcastEpisode object` : `No 'replies' found on object`;
    const tryPleromaWorkaround = id.includes("/objects/");
    if (tryPleromaWorkaround) {
      message += ", trying Pleroma workaround";
    }
    callbacks == null ? void 0 : callbacks.onEvent({ kind: "warning", url: id, nodeId: id, message, object });
    if (tryPleromaWorkaround) {
      return await mastodonFindReplies(id, { after: updateTime, fetcher, cache, debug });
    }
    return [];
  }
  const rt = [];
  const fetched = /* @__PURE__ */ new Set();
  if (typeof replies === "string") {
    const obj = await findOrFetchActivityPubObject(replies, updateTime, fetcher, cache);
    if (obj.type === "OrderedCollection" || obj.type === "OrderedCollectionPage") {
      return await collectRepliesFromOrderedCollection(obj, updateTime, id, fetcher, cache, callbacks, fetched);
    } else {
      throw new Error(`Expected 'replies' to point to an OrderedCollection, found ${JSON.stringify(obj)}`);
    }
  } else if (replies.first) {
    if (typeof replies.first === "object" && replies.first.type === "CollectionPage") {
      if (!replies.first.items && !replies.first.next)
        throw new Error(`Expected 'replies.first.items' or 'replies.first.next' to be present, found ${JSON.stringify(replies.first)}`);
      if (Array.isArray(replies.first.items) && replies.first.items.length > 0) {
        collectRepliesFromItems(replies.first.items, rt, id, id, callbacks);
      }
      if (replies.first.next) {
        if (typeof replies.first.next === "string") {
          rt.push(...await collectRepliesFromPages(replies.first.next, updateTime, id, fetcher, cache, callbacks, fetched));
        } else {
          throw new Error(`Expected 'replies.first.next' to be a string, found ${JSON.stringify(replies.first.next)}`);
        }
      }
      return rt;
    } else {
      throw new Error(`Expected 'replies.first.items' array, or 'replies.first.next' string, found ${JSON.stringify(replies.first)}`);
    }
  } else if (Array.isArray(replies)) {
    if (replies.length > 0)
      throw new Error(`Expected 'replies' array to be empty, found ${JSON.stringify(replies)}`);
    return [];
  } else if (Array.isArray(replies.items)) {
    collectRepliesFromItems(replies.items, rt, id, id, callbacks);
    return rt;
  } else {
    throw new Error(`Expected 'replies' to be a string, array or object with 'first' or 'items', found ${JSON.stringify(replies)}`);
  }
}
async function collectRepliesFromOrderedCollection(orderedCollection, after, nodeId, fetcher, cache, callbacks, fetched) {
  var _a, _b;
  if ((((_a = orderedCollection.items) == null ? void 0 : _a.length) || 0) > 0 || (((_b = orderedCollection.orderedItems) == null ? void 0 : _b.length) || 0) > 0) {
    throw new Error(`Expected OrderedCollection 'items'/'orderedItems' to be empty, found ${JSON.stringify(orderedCollection)}`);
  }
  if (orderedCollection.first === void 0 && orderedCollection.totalItems === 0) {
    return [];
  } else if (typeof orderedCollection.first === "string") {
    return await collectRepliesFromPages(orderedCollection.first, after, nodeId, fetcher, cache, callbacks, fetched);
  } else {
    throw new Error(`Expected OrderedCollection 'first' to be a string, found ${JSON.stringify(orderedCollection)}`);
  }
}
async function collectRepliesFromPages(url, after, nodeId, fetcher, cache, callbacks, fetched) {
  const replies = [];
  let page = await findOrFetchActivityPubObject(url, after, fetcher, cache);
  while (true) {
    if (page.type !== "CollectionPage" && page.type !== "OrderedCollectionPage") {
      throw new Error(`Expected page 'type' of CollectionPage or OrderedCollectionPage, found ${JSON.stringify(page)}`);
    }
    if (page.items) {
      if (!Array.isArray(page.items))
        throw new Error(`Expected page 'items' to be an array, found ${JSON.stringify(page)}`);
      collectRepliesFromItems(page.items, replies, nodeId, url, callbacks);
    }
    if (page.type === "OrderedCollectionPage" && page.orderedItems) {
      if (!Array.isArray(page.orderedItems))
        throw new Error(`Expected page 'orderedItems' to be an array, found ${JSON.stringify(page)}`);
      collectRepliesFromItems(page.orderedItems, replies, nodeId, url, callbacks);
    }
    if (page.next) {
      if (typeof page.next !== "string")
        throw new Error(`Expected page 'next' to be a string, found ${JSON.stringify(page)}`);
      if (fetched.has(page.next))
        return replies;
      page = await findOrFetchActivityPubObject(page.next, after, fetcher, cache);
      fetched.add(page.next);
    } else {
      return replies;
    }
  }
}
function unwrapActivityIfNecessary(object, id, callbacks) {
  if (object.type === "Create" && isStringRecord(object.object)) {
    callbacks == null ? void 0 : callbacks.onEvent({ kind: "warning", url: id, nodeId: id, message: "Unwrapping a Create activity where an object was expected", object });
    return object.object;
  }
  return object;
}
function collectRepliesFromItems(items, outReplies, nodeId, url, callbacks) {
  for (const item of items) {
    if (typeof item === "string" && !item.startsWith("{")) {
      outReplies.push(item);
    } else {
      const itemObj = typeof item === "string" ? JSON.parse(item) : item;
      const { id } = itemObj;
      if (typeof id !== "string")
        throw new Error(`Expected item 'id' to be a string, found ${JSON.stringify(itemObj)}`);
      outReplies.push(id);
      if (typeof item === "string") {
        callbacks == null ? void 0 : callbacks.onEvent({ kind: "warning", nodeId, url, message: "Found item incorrectly double encoded as a json string", object: itemObj });
      }
    }
  }
}
function computeComment(object, id, callbacks) {
  object = unwrapActivityIfNecessary(object, id, callbacks);
  const content = computeContent(object);
  const summary = computeSummary(object);
  const attachments = computeAttachments(object);
  const url = computeUrl(object.url) || id;
  const { published } = object;
  const attributedTo = computeAttributedTo(object.attributedTo);
  if (typeof published !== "string")
    throw new Error(`Expected 'published' to be a string, found ${JSON.stringify(published)}`);
  const questionOptions = computeQuestionOptions(object);
  return { url, published, attachments, content, attributedTo, summary, questionOptions };
}
function computeUrl(url) {
  if (url === void 0 || url === null)
    return void 0;
  if (typeof url === "string")
    return url;
  if (Array.isArray(url)) {
    const v = url.find((v2) => v2.type === "Link" && v2.mediaType === "text/html" && typeof v2.href === "string");
    if (v)
      return v.href;
  }
  throw new Error(`Expected 'url' to be a string, found ${JSON.stringify(url)}`);
}
function computeQuestionOptions(obj) {
  let rt;
  if (obj.type === "Question") {
    for (const prop of ["oneOf", "anyOf"]) {
      const val = obj[prop];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (isStringRecord(item) && item.type === "Note" && typeof item.name === "string") {
            if (!rt)
              rt = [];
            rt.push(item.name);
          } else {
            throw new Error(`Unsupported Question '${prop}' item: ${JSON.stringify(item)}`);
          }
        }
        return rt;
      } else if (val !== void 0) {
        throw new Error(`Unsupported Question '${prop}' value: ${JSON.stringify(val)}`);
      }
    }
  }
  return rt;
}
function computeAttributedTo(attributedTo) {
  if (typeof attributedTo === "string")
    return attributedTo;
  if (Array.isArray(attributedTo) && attributedTo.length > 0) {
    if (attributedTo.every((v) => typeof v === "string"))
      return attributedTo[0];
    if (attributedTo.every((v) => isStringRecord(v))) {
      for (const item of attributedTo) {
        if (item.type === "Person" && typeof item.id === "string") {
          return item.id;
        }
      }
      throw new Error(`Expected 'attributedTo' object array to have a Person with an 'id', found ${JSON.stringify(attributedTo)}`);
    }
  }
  throw new Error(`Expected 'attributedTo' to be a string or non-empty string/object array, found ${JSON.stringify(attributedTo)}`);
}
function computeContent(obj) {
  const rt = computeLanguageTaggedValues(obj, "content", "contentMap");
  if (!rt)
    throw new Error(`Expected either 'contentMap' or 'content' to be present ${JSON.stringify(obj)}`);
  return rt;
}
function computeSummary(obj) {
  return computeLanguageTaggedValues(obj, "summary", "summaryMap");
}
function computeLanguageTaggedValues(obj, stringProp, mapProp) {
  var _a, _b;
  if (obj.type === "PodcastEpisode" && isStringRecord(obj.description) && obj.description.type === "Note")
    obj = obj.description;
  const stringVal = (_a = obj[stringProp]) != null ? _a : void 0;
  const mapVal = (_b = obj[mapProp]) != null ? _b : void 0;
  if (stringVal !== void 0 && typeof stringVal !== "string")
    throw new Error(`Expected '${stringProp}' to be a string, found ${JSON.stringify(stringVal)}`);
  if (mapVal !== void 0 && !(isStringRecord(mapVal) && Object.values(mapVal).every((v) => typeof v === "string")))
    throw new Error(`Expected '${mapProp}' to be a string record, found ${JSON.stringify(mapVal)}`);
  if (mapVal !== void 0)
    return mapVal;
  if (stringVal !== void 0)
    return { und: stringVal };
  if (obj.type === "Video" && typeof obj.name === "string" && isNonEmpty(obj.name))
    return { und: obj.name };
}
function computeAttachments(object) {
  const rt = [];
  if (!object.attachment)
    return rt;
  const attachments = isReadonlyArray(object.attachment) ? object.attachment : [object.attachment];
  for (const attachment of attachments) {
    rt.push(computeAttachment(attachment));
  }
  return rt;
}
function computeAttachment(object) {
  if (typeof object !== "object" || object.type !== "Document" && object.type !== "Image")
    throw new Error(`Expected attachment 'type' of Document or Image, found ${JSON.stringify(object.type)}`);
  const { mediaType, width, height, url } = object;
  if (typeof mediaType !== "string")
    throw new Error(`Expected attachment 'mediaType' to be a string, found ${JSON.stringify(mediaType)}`);
  if (width !== void 0 && typeof width !== "number")
    throw new Error(`Expected attachment 'width' to be a number, found ${JSON.stringify(width)}`);
  if (height !== void 0 && typeof height !== "number")
    throw new Error(`Expected attachment 'height' to be a number, found ${JSON.stringify(height)}`);
  if (typeof url !== "string")
    throw new Error(`Expected attachment 'url' to be a string, found ${JSON.stringify(url)}`);
  return { mediaType, width, height, url };
}
function computeCommenter(person, asof) {
  let icon;
  if (person.icon) {
    if (typeof person.icon !== "object" || isReadonlyArray(person.icon) || person.icon.type !== "Image")
      throw new Error(`Expected person 'icon' to be an object, found: ${JSON.stringify(person.icon)}`);
    icon = computeIcon(person.icon);
  }
  const { name, preferredUsername, url: apUrl, id } = person;
  if (name !== void 0 && typeof name !== "string")
    throw new Error(`Expected person 'name' to be a string, found: ${JSON.stringify(person)}`);
  if (preferredUsername !== void 0 && typeof preferredUsername !== "string")
    throw new Error(`Expected person 'preferredUsername' to be a string, found: ${JSON.stringify(person)}`);
  const nameOrPreferredUsername = name || preferredUsername;
  if (!nameOrPreferredUsername)
    throw new Error(`Expected person 'name' or 'preferredUsername', found: ${JSON.stringify(person)}`);
  if (apUrl !== void 0 && typeof apUrl !== "string")
    throw new Error(`Expected person 'url' to be a string, found: ${JSON.stringify(apUrl)}`);
  const url = apUrl || id;
  if (typeof url !== "string")
    throw new Error(`Expected person 'url' or 'id' to be a string, found: ${JSON.stringify(url)}`);
  const fqUsername = computeFqUsername(url, person.preferredUsername);
  return { icon, name: nameOrPreferredUsername, url, fqUsername, asof };
}
function computeIcon(image) {
  const { url, mediaType } = image;
  if (typeof url !== "string")
    throw new Error(`Expected icon 'url' to be a string, found: ${JSON.stringify(url)}`);
  if (mediaType !== void 0 && typeof mediaType !== "string")
    throw new Error(`Expected icon 'mediaType' to be a string, found: ${JSON.stringify(mediaType)}`);
  return { url, mediaType };
}
function computeFqUsername(url, preferredUsername) {
  const u = new URL(url);
  const m = /^\/(@[^\/]+)$/.exec(u.pathname);
  const username = m ? m[1] : preferredUsername;
  if (!username)
    throw new Error(`Unable to compute username from url: ${url}`);
  return `${username}@${u.hostname}`;
}
async function mastodonFindStatusIdForActivityPubId(id, after, fetcher, cache, debug) {
  const { origin } = new URL(id);
  const url = new URL(origin);
  url.pathname = "/api/v2/search";
  url.searchParams.set("q", id);
  url.searchParams.set("type", "statuses");
  const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, { accept: "application/json" });
  if (debug)
    console.log(JSON.stringify(obj, void 0, 2));
  if (isStringRecord(obj) && Array.isArray(obj.statuses) && obj.statuses.length === 1) {
    const status = obj.statuses[0];
    if (isStringRecord(status) && typeof status.id === "string" && status.id !== "") {
      return status.id;
    }
  }
  return void 0;
}

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap_bluesky.ts
var BlueskyProtocolImplementation = {
  async initThreadcap(url, opts) {
    const { uri, nodes, commenters } = await getThread(url, opts, 1e3);
    return { protocol: "bluesky", roots: [uri], nodes, commenters };
  },
  async fetchComment(id, opts) {
    const { uri, nodes } = await getThread(id, opts, 0);
    const node = nodes[uri];
    if (!node)
      throw new Error(`fetchComment: no node!`);
    if (!node.comment)
      throw new Error(`fetchComment: no node comment!`);
    return node.comment;
  },
  async fetchCommenter(attributedTo, opts) {
    const { updateTime, fetcher, cache, bearerToken } = opts;
    const res = await getProfile(attributedTo, { updateTime, fetcher, cache, bearerToken });
    return computeCommenter2(res, updateTime);
  },
  async fetchReplies(id, opts) {
    const { uri, nodes } = await getThread(id, opts, 1);
    const node = nodes[uri];
    if (!node)
      throw new Error(`fetchReplies: no node!`);
    if (!node.replies)
      throw new Error(`fetchReplies: no node replies!`);
    return node.replies;
  }
};
function makeUrl(url, queryParams) {
  const u = new URL(url);
  Object.entries(queryParams).forEach(([n, v]) => u.searchParams.set(n, v.toString()));
  return u.toString();
}
function isGetPostThreadResponse(obj) {
  return isStringRecord(obj) && isThreadViewPost(obj.thread);
}
function isThreadViewPost(obj) {
  return isStringRecord(obj) && obj["$type"] === "app.bsky.feed.defs#threadViewPost" && isStringRecord(obj.post) && typeof obj.post.uri === "string" && isStringRecord(obj.post.author) && typeof obj.post.author.did === "string" && typeof obj.post.author.handle === "string" && (obj.post.author.displayName === void 0 || typeof obj.post.author.displayName === "string") && (obj.post.author.avatar === void 0 || typeof obj.post.author.avatar === "string") && Array.isArray(obj.post.author.labels) && isStringRecord(obj.post.record) && obj.post.record["$type"] === "app.bsky.feed.post" && typeof obj.post.record.text === "string" && (obj.post.replyCount === void 0 || typeof obj.post.replyCount === "number") && (obj.replies === void 0 || Array.isArray(obj.replies) && obj.replies.every(isThreadViewPost));
}
function isGetProfileResponse(obj) {
  return isStringRecord(obj) && typeof obj.did === "string" && typeof obj.handle === "string" && typeof obj.displayName === "string" && (obj.avatar === void 0 || typeof obj.avatar === "string");
}
async function fetchAppviewJson(url, { updateTime, fetcher, cache, bearerToken }) {
  return await findOrFetchJson(url, updateTime, fetcher, cache, { accept: "application/json", authorization: bearerToken ? `Bearer ${bearerToken}` : void 0 });
}
async function getProfile(handleOrDid, { updateTime, fetcher, cache, bearerToken }) {
  const res = await fetchAppviewJson(makeUrl("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile", { actor: handleOrDid }), { updateTime, fetcher, cache, bearerToken });
  if (!isGetProfileResponse(res))
    throw new Error(JSON.stringify(res, void 0, 2));
  return res;
}
async function getThread(url, opts, depth) {
  const { debug, fetcher, updateTime = new Date().toISOString(), cache, bearerToken } = opts;
  const { protocol, pathname } = destructureThreadcapUrl(url);
  const resolveDid = async (handleOrDid) => {
    if (handleOrDid.startsWith("did:"))
      return handleOrDid;
    const res2 = await getProfile(handleOrDid, { updateTime, fetcher, cache, bearerToken });
    return res2.did;
  };
  const atUri = await (async () => {
    var _a;
    if (protocol === "at:")
      return url;
    if (protocol === "https:") {
      const [_, handleOrDid, postId] = (_a = /^\/profile\/([^/]+)\/post\/([^/]+)$/.exec(pathname)) != null ? _a : [];
      if (handleOrDid && postId)
        return `at://${await resolveDid(handleOrDid)}/app.bsky.feed.post/${postId}`;
    }
    throw new Error(`Unexpected bluesky url: ${url}`);
  })();
  const res = await fetchAppviewJson(makeUrl("https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread", { uri: atUri, depth, parentHeight: 0 }), { updateTime, fetcher, cache, bearerToken });
  if (!isGetPostThreadResponse(res))
    throw new Error(`Expected GetPostThreadResponse: ${JSON.stringify(res, void 0, 2)}`);
  if (debug)
    console.log(JSON.stringify(res, void 0, 2));
  const nodes = {};
  const commenters = {};
  const processThread = (thread) => {
    const { uri: uri2, author, replyCount } = thread.post;
    let replies;
    let repliesAsof;
    if (replyCount === void 0) {
      if (thread.replies !== void 0)
        throw new Error(`Expected no thread.replies for undefined replyCount`);
    } else {
      if (thread.replies !== void 0) {
        replies = [];
        for (const reply of thread.replies) {
          const replyUri = processThread(reply);
          replies.push(replyUri);
        }
        repliesAsof = updateTime;
      }
    }
    nodes[uri2] = {
      replies,
      repliesAsof,
      comment: {
        attachments: [],
        content: { und: thread.post.record.text },
        attributedTo: author.did
      },
      commentAsof: updateTime
    };
    commenters[author.did] = computeCommenter2(author, updateTime);
    return uri2;
  };
  const uri = processThread(res.thread);
  return { uri, nodes, commenters };
}
function computeCommenter2(author, updateTime) {
  var _a;
  return {
    asof: updateTime,
    name: (_a = author.displayName) != null ? _a : author.handle,
    fqUsername: author.handle,
    icon: author.avatar ? { url: author.avatar } : void 0
  };
}

// https:/raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap_twitter.ts
var TwitterProtocolImplementation = {
  async initThreadcap(url, opts) {
    const { debug } = opts;
    const { hostname, pathname } = new URL(url);
    const m = /^\/.*?\/status\/(\d+)$/.exec(pathname);
    if (!/^(mobile\.)?twitter\.com$/.test(hostname) || !m)
      throw new Error(`Unexpected tweet url: ${url}`);
    const [_, id] = m;
    const tweetApiUrl = `https://api.twitter.com/2/tweets/${id}`;
    const obj = await findOrFetchTwitter(tweetApiUrl, new Date().toISOString(), opts);
    if (debug)
      console.log(JSON.stringify(obj, void 0, 2));
    return { protocol: "twitter", roots: [tweetApiUrl], nodes: {}, commenters: {} };
  },
  async fetchComment(id, opts) {
    const { updateTime, debug, state } = opts;
    if (typeof state.conversationId === "string") {
      const conversation = await findOrFetchConversation(state.conversationId, opts);
      const tweetId = id.split("/").pop();
      const tweet = conversation.tweets[tweetId];
      if (!tweet)
        throw new Error(`fetchComment: tweet ${tweetId} not found in conversation`);
      return computeCommentFromTweetObj(tweet);
    }
    const url = new URL(id);
    url.searchParams.set("tweet.fields", "author_id,lang,created_at");
    const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
    if (debug)
      console.log(JSON.stringify(obj, void 0, 2));
    return computeCommentFromTweetObj(obj.data);
  },
  async fetchCommenter(attributedTo, opts) {
    const { updateTime, debug, state } = opts;
    if (typeof state.conversationId === "string") {
      const conversation = await findOrFetchConversation(state.conversationId, opts);
      const userId = attributedTo.split("/").pop();
      const user = conversation.users[userId];
      if (!user)
        throw new Error(`fetchCommenter: user ${userId} not found in conversation`);
      return computeCommenterFromUserObj(user, updateTime);
    }
    const url = new URL(attributedTo);
    url.searchParams.set("user.fields", "profile_image_url");
    const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
    if (debug)
      console.log("fetchCommenter", JSON.stringify(obj, void 0, 2));
    return computeCommenterFromUserObj(obj.data, updateTime);
  },
  async fetchReplies(id, opts) {
    const m = /^https:\/\/api\.twitter\.com\/2\/tweets\/(.*?)$/.exec(id);
    if (!m)
      throw new Error(`Unexpected tweet id: ${id}`);
    const [_, tweetId] = m;
    const convo = await findOrFetchConversation(tweetId, opts);
    return Object.values(convo.tweets).filter((v) => v.referenced_tweets.some((w) => w.type === "replied_to" && w.id === tweetId)).map((v) => `https://api.twitter.com/2/tweets/${v.id}`);
  }
};
function computeCommenterFromUserObj(obj, asof) {
  const name = obj.name;
  const fqUsername = "@" + obj.username;
  const userUrl = `https://twitter.com/${obj.username}`;
  const iconUrl = obj.profile_image_url;
  const iconUrlLower = (iconUrl || "").toLowerCase();
  const iconMediaType = iconUrlLower.endsWith(".jpg") ? "image/jpeg" : iconUrlLower.endsWith(".png") ? "image/png" : void 0;
  const icon = iconUrl ? { url: iconUrl, mediaType: iconMediaType } : void 0;
  return {
    asof,
    name,
    fqUsername,
    url: userUrl,
    icon
  };
}
function computeCommentFromTweetObj(obj) {
  const tweetId = obj.id;
  const text = obj.text;
  const authorId = obj.author_id;
  const lang = obj.lang;
  const createdAt = obj.created_at;
  const content = {};
  content[lang] = text;
  const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
  return {
    attachments: [],
    attributedTo: `https://api.twitter.com/2/users/${authorId}`,
    content,
    published: createdAt,
    url: tweetUrl
  };
}
async function findOrFetchTwitter(url, after, opts) {
  const { fetcher, cache, bearerToken } = opts;
  const obj = await findOrFetchJson(url, after, fetcher, cache, { accept: "application/json", authorization: `Bearer ${bearerToken}` });
  return obj;
}
async function findOrFetchConversation(tweetId, opts) {
  const { updateTime, state, debug } = opts;
  let { conversation } = state;
  if (!conversation) {
    const conversationId = await findOrFetchConversationId(tweetId, opts);
    state.conversationId = conversationId;
    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query", `conversation_id:${conversationId}`);
    url.searchParams.set("expansions", `referenced_tweets.id,author_id`);
    url.searchParams.set("tweet.fields", `author_id,lang,created_at`);
    url.searchParams.set("user.fields", `id,name,username,profile_image_url`);
    url.searchParams.set("max_results", `100`);
    const tweets = {};
    const users = {};
    let nextToken;
    let i = 0;
    while (++i) {
      if (nextToken) {
        url.searchParams.set("next_token", nextToken);
      } else {
        url.searchParams.delete("next_token");
      }
      const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
      if (debug)
        console.log(`findOrFetchConversation nextToken=${nextToken}`, JSON.stringify(obj, void 0, 2));
      for (const tweetObj of obj.data) {
        const tweet = tweetObj;
        tweets[tweet.id] = tweet;
      }
      if (obj.includes && Array.isArray(obj.includes.users)) {
        for (const userObj of obj.includes.users) {
          const user = userObj;
          users[user.id] = user;
        }
      }
      if (obj.meta && typeof obj.meta.next_token === "string") {
        nextToken = obj.meta.next_token;
        if (i === 50)
          break;
      } else {
        break;
      }
    }
    conversation = { tweets, users };
    state.conversation = conversation;
  }
  return conversation;
}
async function findOrFetchConversationId(tweetId, opts) {
  const { updateTime, state, debug } = opts;
  let { conversationId } = state;
  if (typeof conversationId === "string")
    return conversationId;
  const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
  url.searchParams.set("tweet.fields", "conversation_id");
  const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
  if (debug)
    console.log("findOrFetchConversation", JSON.stringify(obj, void 0, 2));
  conversationId = obj.data.conversation_id;
  if (typeof conversationId !== "string")
    throw new Error(`Unexpected conversationId in payload: ${JSON.stringify(obj, void 0, 2)}`);
  state.conversationId = conversationId;
  return conversationId;
}

// https://raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap.ts
function isValidProtocol(protocol) {
  return protocol === "activitypub" || protocol === "twitter" || protocol === "bluesky";
}
var MAX_LEVELS = 1e3;
async function makeThreadcap(url, opts) {
  const { cache, updateTime, userAgent, protocol, bearerToken, debug } = opts;
  const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
  const implementation = computeProtocolImplementation(protocol);
  return await implementation.initThreadcap(url, { fetcher, cache, updateTime, bearerToken, debug });
}
async function updateThreadcap(threadcap, opts) {
  const { userAgent, cache, updateTime, callbacks, maxLevels, maxNodes: maxNodesInput, startNode, keepGoing, bearerToken, debug } = opts;
  const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
  const maxLevel = Math.min(Math.max(maxLevels === void 0 ? MAX_LEVELS : Math.round(maxLevels), 0), MAX_LEVELS);
  const maxNodes = maxNodesInput === void 0 ? void 0 : Math.max(Math.round(maxNodesInput), 0);
  if (startNode && !threadcap.nodes[startNode])
    throw new Error(`Invalid start node: ${startNode}`);
  if (maxLevel === 0)
    return;
  if (maxNodes === 0)
    return;
  const implementation = computeProtocolImplementation(threadcap.protocol);
  const state = {};
  const idsBylevel = [startNode ? [startNode] : [...threadcap.roots]];
  let remaining = 1;
  let processed = 0;
  const processLevel = async (level) => {
    callbacks == null ? void 0 : callbacks.onEvent({ kind: "process-level", phase: "before", level: level + 1 });
    const nextLevel = level + 1;
    for (const id of idsBylevel[level] || []) {
      const processReplies = nextLevel < maxLevel;
      const node = await processNode(id, processReplies, threadcap, implementation, { updateTime, callbacks, state, fetcher, cache, bearerToken, debug });
      remaining--;
      processed++;
      if (maxNodes && processed >= maxNodes)
        return;
      if (keepGoing && !keepGoing())
        return;
      if (node.replies && nextLevel < maxLevel) {
        if (!idsBylevel[nextLevel])
          idsBylevel[nextLevel] = [];
        idsBylevel[nextLevel].push(...node.replies);
        remaining += node.replies.length;
      }
      callbacks == null ? void 0 : callbacks.onEvent({ kind: "nodes-remaining", remaining });
    }
    callbacks == null ? void 0 : callbacks.onEvent({ kind: "process-level", phase: "after", level: level + 1 });
    if (idsBylevel[nextLevel])
      await processLevel(nextLevel);
  };
  await processLevel(0);
}
var InMemoryCache = class {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  get(id, after) {
    const { response, fetched } = this.map.get(id) || {};
    if (response && fetched && fetched > after) {
      if (this.onReturningCachedResponse)
        this.onReturningCachedResponse(id, after, fetched, response);
      return Promise.resolve(response);
    }
    return Promise.resolve(void 0);
  }
  put(id, fetched, response) {
    this.map.set(id, { response, fetched });
    return Promise.resolve();
  }
};
function computeDefaultMillisToWait(input) {
  const { remaining, millisTillReset } = input;
  if (remaining >= 100)
    return 0;
  return remaining > 0 ? Math.round(millisTillReset / remaining) : millisTillReset;
}
function makeRateLimitedFetcher(fetcher, opts = {}) {
  const { callbacks } = opts;
  const computeMillisToWait = opts.computeMillisToWait || computeDefaultMillisToWait;
  const endpointLimits = /* @__PURE__ */ new Map();
  return async (url, opts2) => {
    const { hostname, pathname } = new URL(url);
    const twitterEndpoint = computeTwitterEndpoint(hostname, pathname);
    const endpoint = twitterEndpoint || hostname;
    const limits = endpointLimits.get(endpoint);
    if (limits) {
      const { limit: limit2, remaining: remaining2, reset: reset2 } = limits;
      const millisTillReset = new Date(reset2).getTime() - Date.now();
      const millisToWait = computeMillisToWait({ endpoint, limit: limit2, remaining: remaining2, reset: reset2, millisTillReset });
      if (millisToWait > 0) {
        callbacks == null ? void 0 : callbacks.onEvent({ kind: "waiting-for-rate-limit", endpoint, millisToWait, millisTillReset, limit: limit2, remaining: remaining2, reset: reset2 });
        await sleep(millisToWait);
      }
    }
    const res = await fetcher(url, opts2);
    const limitHeader = twitterEndpoint ? "x-rate-limit-limit" : "x-ratelimit-limit";
    const remainingHeader = twitterEndpoint ? "x-rate-limit-remaining" : "x-ratelimit-remaining";
    const resetHeader = twitterEndpoint ? "x-rate-limit-reset" : "x-ratelimit-reset";
    const limit = tryParseInt(res.headers.get(limitHeader) || "");
    const remaining = tryParseInt(res.headers.get(remainingHeader) || "");
    const resetStr = res.headers.get(resetHeader) || "";
    const reset = twitterEndpoint ? tryParseEpochSecondsAsIso8601(resetStr) : tryParseIso8601(resetStr);
    if (limit !== void 0 && remaining !== void 0 && reset !== void 0) {
      endpointLimits.set(endpoint, { limit, remaining, reset });
    }
    return res;
  };
}
async function makeSigningAwareFetcher(fetcher, opts) {
  const { keyId, privateKeyPemText, mode = "when-needed" } = opts;
  const privateKey = await importKeyFromPem(privateKeyPemText, "private");
  const hostsNeedingSignedRequests = /* @__PURE__ */ new Set();
  const always = mode === "always";
  return async (url, opts2) => {
    const { host } = new URL(url);
    const { headers = {} } = opts2 != null ? opts2 : {};
    const accept = Object.entries(headers).filter((v) => /^accept$/i.test(v[0])).map((v) => v[1])[0];
    const isActivityPubRequest = accept && /activity\+json/.test(accept);
    if (!isActivityPubRequest)
      return await fetcher(url, opts2);
    const signedFetch = async () => {
      const { signature, date } = await computeHttpSignatureHeaders({ method: "GET", url, keyId, privateKey });
      headers.signature = signature;
      headers.date = date;
      return await fetcher(url, { headers });
    };
    if (always || hostsNeedingSignedRequests.has(host))
      return await signedFetch();
    const res = await fetcher(url, opts2);
    if (res.status === 401) {
      hostsNeedingSignedRequests.add(host);
      return await signedFetch();
    }
    return res;
  };
}
function computeTwitterEndpoint(hostname, pathname) {
  if (hostname === "api.twitter.com") {
    return pathname.replaceAll(/\d{4,}/g, ":id");
  }
}
function makeFetcherWithUserAgent(fetcher, userAgent) {
  userAgent = userAgent.trim();
  if (userAgent.length === 0)
    throw new Error(`Expected non-blank user-agent`);
  return async (url, opts) => {
    const headers = { ...(opts == null ? void 0 : opts.headers) || {}, "user-agent": userAgent };
    return await fetcher(url, { headers });
  };
}
function computeProtocolImplementation(protocol) {
  if (protocol === void 0 || protocol === "activitypub")
    return ActivityPubProtocolImplementation;
  if (protocol === "twitter")
    return TwitterProtocolImplementation;
  if (protocol === "bluesky")
    return BlueskyProtocolImplementation;
  throw new Error(`Unsupported protocol: ${protocol}`);
}
async function processNode(id, processReplies, threadcap, implementation, opts) {
  const { updateTime, callbacks } = opts;
  let node = threadcap.nodes[id];
  if (!node) {
    node = {};
    threadcap.nodes[id] = node;
  }
  const updateComment = !node.commentAsof || node.commentAsof < updateTime;
  const existingCommenter = node.comment ? threadcap.commenters[node.comment.attributedTo] : void 0;
  const updateCommenter = !existingCommenter || existingCommenter.asof < updateTime;
  if (updateComment || updateCommenter) {
    try {
      if (updateComment) {
        node.comment = await implementation.fetchComment(id, opts);
      }
      const { attributedTo } = node.comment;
      const existingCommenter2 = threadcap.commenters[attributedTo];
      if (!existingCommenter2 || existingCommenter2.asof < updateTime) {
        threadcap.commenters[attributedTo] = await implementation.fetchCommenter(attributedTo, opts);
      }
      node.commentError = void 0;
    } catch (e) {
      node.comment = void 0;
      node.commentError = `${e.stack || e}`;
    }
    node.commentAsof = updateTime;
  }
  callbacks == null ? void 0 : callbacks.onEvent({ kind: "node-processed", nodeId: id, part: "comment", updated: updateComment });
  if (processReplies) {
    const updateReplies = !node.repliesAsof || node.repliesAsof < updateTime;
    if (updateReplies) {
      try {
        node.replies = await implementation.fetchReplies(id, opts);
        node.repliesError = void 0;
      } catch (e) {
        node.replies = void 0;
        node.repliesError = `${e.stack || e}`;
      }
      node.repliesAsof = updateTime;
    }
    callbacks == null ? void 0 : callbacks.onEvent({ kind: "node-processed", nodeId: id, part: "replies", updated: updateReplies });
  }
  return node;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function tryParseInt(value) {
  try {
    return parseInt(value);
  } catch {
    return void 0;
  }
}
function tryParseIso8601(value) {
  return isValidIso8601(value) ? value : void 0;
}
function tryParseEpochSecondsAsIso8601(value) {
  const seconds = tryParseInt(value);
  return seconds && seconds > 0 ? new Date(seconds * 1e3).toISOString() : void 0;
}
