// deno-lint-ignore-file no-unused-vars
import { Cache, Callbacks, Comment, Commenter, Fetcher, Instant, Threadcap } from './threadcap.ts';
import { ProtocolImplementation } from './threadcap_implementation.ts';

export const TwitterProtocolImplementation: ProtocolImplementation = {
    async initThreadcap(url: string, fetcher: Fetcher, cache: Cache): Promise<Threadcap> {
        await Promise.resolve();
        throw new Error('TODO implement initThreadcap');
    },
    
    async fetchComment(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<Comment> {
        await Promise.resolve();
        throw new Error('TODO implement fetchComment');
    },
    
    async fetchCommenter(attributedTo: string, updateTime: Instant, fetcher: Fetcher, cache: Cache): Promise<Commenter> {
        await Promise.resolve();
        throw new Error('TODO implement fetchCommenter');
    },
    
    async fetchReplies(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<readonly string[]> {
        await Promise.resolve();
        throw new Error('TODO implement fetchReplies');
    },
};
