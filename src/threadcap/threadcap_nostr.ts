import { Threadcap, Comment, Commenter, Node } from './threadcap.ts';
import { ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions, destructureThreadcapUrl } from './threadcap_implementation.ts';

export const NostrProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { debug, updateTime = new Date().toISOString() } = opts;
        const { protocol, hostname, searchParams } = destructureThreadcapUrl(url);
        const m = /^30311:([0-9a-f]{64}):(.*?)$/.exec(searchParams.get('space') ?? '');
        if (protocol !== 'nostr:' || !m) throw new Error(`Threadcap nostr urls should be in this form: nostr://<relay-server>?space=30311:<64-hexchars>:<identifer>`);
        const [ space, _, identifier ] = m;
        const limit = parseInt(searchParams.get('limit') ?? '1000');
        const nodes: Record<string, Node> = {};
        const commenters: Record<string, Commenter> = {};
        
        const makeUri = ({ message }: { message: string | undefined }) => {
            const u = new URL(`${protocol}//${hostname}`);
            u.searchParams.set('space', space);
            if (message !== undefined) u.searchParams.set('message', message);
            return u.toString();
        }

        const state: Record<string, unknown> = {};
        const pubkeys = new Set<string>();

        // query for the messages
        const messages = await query({ 
            kinds: [ 1311 ],
            limit,
            tags: {
                '#a': [ space ],
            }
        }, { hostname, debug, state });

        for (const message of messages) {
            const uri = makeUri({ message: message.id });
            nodes[uri] = {
                comment: {
                    attachments: [],
                    attributedTo: message.pubkey,
                    content: { un: message.content },
                    published: new Date(message.created_at * 1000).toISOString(),
                },
                commentAsof: updateTime,
                replies: [],
                repliesAsof: updateTime,
            };
            pubkeys.add(message.pubkey);
        }

        // query for the activity
        const activities = await query({ 
            kinds: [ 30311 ],
            tags: {
                '#d': [ identifier ],
            }
        }, { hostname, debug, state });
        const activity = activities.find(v => v.tags.some(v => v[0] === 'd' && v[1] === identifier));
        const rootUri = makeUri({ message: undefined });
        nodes[rootUri] = {
            comment: {
                attachments: [],
                attributedTo: activity ? activity.pubkey : '',
                content: { un: activity?.tags.find(v => v[0] === 'title')?.at(1) ?? '' },
                published: activity ? new Date(activity.created_at * 1000).toISOString() : undefined,
            },
            commentAsof: updateTime,
            replies: Object.keys(nodes),
            repliesAsof: updateTime,
        };
        if (activity) pubkeys.add(activity.pubkey);

        // resolve profiles for pubkeys
        const relaysForProfiles = [ 'relay.primal.net', 'relay.damus.io', 'relay.snort.social' ];
        const remainingPubkeys = new Set(pubkeys);
        const allProfiles: NostrEvent[] = [];
        const resolvedByHostname: Record<string, number> = {};
        for (const relayForProfiles of relaysForProfiles) {
            let resolved = 0;
            const profiles = await query({ kinds: [ 0 ], authors: [ ...remainingPubkeys ] }, { hostname: relayForProfiles, state, debug });
            allProfiles.push(...profiles);
            for (const profile of profiles) {
                remainingPubkeys.delete(profile.pubkey);
                resolved++;
            }
            resolvedByHostname[relayForProfiles] = resolved;

            if (remainingPubkeys.size === 0) break;
        }
        resolvedByHostname['unresolved'] = pubkeys.size - Object.values(resolvedByHostname).reduce((prev, cur) => prev + cur, 0);

        for (const pubkey of pubkeys) {
            const profile = allProfiles.find(v => v.pubkey === pubkey);
            if (profile) {
                const { name, display_name, picture, website, lud16 } = JSON.parse(profile.content) as NostrProfile;

                commenters[pubkey] = {
                    name: display_name ?? name ?? pubkey,
                    fqUsername: lud16,
                    icon: picture ? { url: picture } : undefined,
                    url: website,
                    asof: updateTime,
                };
            } else {
                commenters[pubkey] = {
                    name: pubkey,
                    asof: updateTime,
                };
            }
        }
        if (debug) console.log(JSON.stringify({ resolvedByHostname }));
        return { protocol: 'nostr', roots: [ rootUri ], nodes, commenters };
    },
    
    async fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
        await Promise.resolve();
        throw new Error(`fetchComment(${JSON.stringify({ id, opts })}) not implemented`);
    },
    
    async fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
        await Promise.resolve();
        throw new Error(`fetchCommenter(${JSON.stringify({ attributedTo, opts })}) not implemented`);
    },
    
    async fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
        await Promise.resolve();
        throw new Error(`fetchReplies(${JSON.stringify({ id, opts })}) not implemented`);
    },
};

//

type Resolve<T> = (value: T | PromiseLike<T>) => void;
type Reject = (reason?: unknown) => void;
type PromiseWithResolvers<T> = { resolve: Resolve<T>, reject: Reject, promise: Promise<T>, done: () => boolean } ;

function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
    let resolve: Resolve<T> = () => {};
    let reject: Reject = () => {};
    let done = false;
    const promise = new Promise<T>(function (resolve_, reject_) {
        resolve = value => { done = true; resolve_(value); }
        reject = reason => { done = true; reject_(reason); }
    });

    return { resolve, reject, promise, done: () => done };
}

// https://github.com/nostr-protocol/nips/blob/master/01.md
type NostrEvent = {
    /** 32-bytes lowercase hex-encoded sha256 of the serialized event data */
    id: string,

    /** 32-bytes lowercase hex-encoded public key of the event creator */
    pubkey: string,

    /** unix timestamp in seconds */
    created_at: number,

    /** integer between 0 and 65535 */
    kind: number,

    tags: string[][],

    content: string,

    /** 64-bytes lowercase hex of the signature of the sha256 hash of the serialized event data, which is the same as the "id" field */
    sig: string,
};

type NostrProfile = {
    name?: string,
    display_name?: string,
    website?: string,
    picture?: string,
    lud16?: string,
};

async function query(filter: { kinds?: number[], limit?: number, tags?: Record<string, string[]>, authors?: string[] }, opts: { hostname: string, debug?: boolean, state: Record<string, unknown> }): Promise<NostrEvent[]> {
    const { hostname, debug, state } = opts;

    const ws = await (async () => {
        const stateKey = `ws-${hostname}`;
        const existing = state[stateKey];
        if (existing) return existing as WebSocket;
        const { resolve, reject, promise } = promiseWithResolvers();
        const ws = new WebSocket(`wss://${hostname}`);
        state[stateKey] = ws;
        ws.onopen = () => {
            if (debug) console.log('onopen');
            resolve(undefined);
        };
        ws.addEventListener('error', () => reject());
        ws.addEventListener('close', () => reject());
        await promise;
        return ws;
    })();
    
    const subscriptionId = crypto.randomUUID();
    const { resolve, reject, promise, done } = promiseWithResolvers<NostrEvent[]>();

    const send = (arr: unknown[]) => {
        const json = JSON.stringify(arr);
        if (debug) console.log(`send: ${ws.readyState} ${json}`);
        ws.send(json);
    }

    const rt: NostrEvent[] = [];

    ws.addEventListener('message', ({ data }) => {
        if (done()) return;
        if (debug) console.log(`onmessage: ${typeof data === 'string' && data.startsWith('[') && data.endsWith(']') ? JSON.stringify(JSON.parse(data), undefined, 2) : JSON.stringify(data)}`);
        let parsed: unknown;
        try {
            if (typeof data !== 'string') throw new Error(`Unexpected data type: ${typeof data} ${data}`);
            parsed = JSON.parse(data);
            if (!Array.isArray(parsed)) throw new Error(`Unexpected payload`);
            const [ first, ...rest ] = parsed;
            if (first === 'EOSE') {
                const [ _sub ] = rest;
                // if (sub === subscriptionId) send([ 'CLOSE', subscriptionId ]); // TODO when server supports this
                resolve(rt);
            } else if (first === 'CLOSED') {
                const [ sub, reason ] = rest;
                if (sub === subscriptionId) throw new Error(`relay closed subscription: ${reason}`);
            } else if (first === 'EVENT') {
                const [ sub, event ] = rest;
                if (sub === subscriptionId) rt.push(event as NostrEvent);
            }
        } catch (e) {
            reject(`onmessage: ${e.message}${parsed ? ` (${JSON.stringify(parsed)})` : ''}`);
        }
    });
    ws.addEventListener('close', ({ code, reason, wasClean }) => {
        if (done()) return;
        const msg = `onclose ${subscriptionId} ${JSON.stringify({ code, reason, wasClean })}`;
        if (debug) console.log(msg);
        reject(msg);
    });
    
    const { kinds, limit, tags, authors } = filter;
    send([ 'REQ', subscriptionId, { kinds, limit, ...tags, authors } ]);
    return promise;
}
