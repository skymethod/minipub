import { Threadcap, Comment, Commenter } from './threadcap.ts';
import { ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions, destructureThreadcapUrl } from './threadcap_implementation.ts';

export const NostrProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { debug } = opts;
        const { protocol, hostname, searchParams } = destructureThreadcapUrl(url);
        const m = /^30311:([0-9a-f]{64}):(.*?)$/.exec(searchParams.get('space') ?? '');
        if (protocol !== 'nostr:' || !m) throw new Error(`Threadcap nostr urls should be in this form: nostr://<relay-server>?space=30311:<64-hexchars>:<identifer>`);
        const [ _, _hexchars, identifier ] = m;
        const subscriptionId = crypto.randomUUID();
        let resolvePromise: (value: unknown) => void;
        let rejectPromise: (reason?: unknown) => void;
        const p = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const ws = new WebSocket(`wss://${hostname}`);
        const send = (arr: unknown[]) => {
            const json = JSON.stringify(arr);
            if (debug) console.log(`send: ${json}`);
            ws.send(json);
        }
        ws.onmessage = ({ data }) => {
            if (debug) console.log(`onmessage: ${JSON.stringify(data)}`);
            let parsed: unknown;
            try {
                if (typeof data !== 'string') throw new Error(`Unexpected data type: ${typeof data} ${data}`);
                parsed = JSON.parse(data);
                if (!Array.isArray(parsed)) throw new Error(`Unexpected payload`);
                const [ first, ...rest ] = parsed;
                if (first === 'EOSE') {
                    const [ sub ] = rest;
                    if (typeof sub !== 'string') throw new Error(`Bad sub: ${sub}`);
                    if (sub === subscriptionId) {
                        send([ 'CLOSE', subscriptionId ]);
                    } else {
                        throw new Error(`Unexpected sub: ${sub}`);
                    }
                }
            } catch (e) {
                rejectPromise(`onmessage: ${e.message}${parsed ? ` (${JSON.stringify(parsed)})` : ''}`);
            }
        };
        ws.onclose = () => {
            if (debug) console.log('onclose');
            resolvePromise(undefined);
        };
        ws.onopen = () => {
            if (debug) console.log('onopen');
            send([ 'REQ', subscriptionId, 
            { 
                kinds: [ 1311, 30311 ],
                '#d': [ identifier ],
            } ]);
        };
        await p;

        throw new Error(`initThreadcap(${JSON.stringify({ url })}) not implemented`);
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