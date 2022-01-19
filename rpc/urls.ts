export function computeActorId(opts: { origin: string, actorUuid: string }) {
    const { origin, actorUuid } = opts;
    return `${origin}/actors/${actorUuid}`;
}

export function computeObjectId(opts: { origin: string, actorUuid: string, objectUuid: string  }) {
    const { origin, actorUuid, objectUuid } = opts;
    return `${origin}/actors/${actorUuid}/objects/${objectUuid}`;
}

export function computeActivityId(opts: { origin: string, actorUuid: string, activityUuid: string  }) {
    const { origin, actorUuid, activityUuid } = opts;
    return `${origin}/actors/${actorUuid}/activities/${activityUuid}`;
}
