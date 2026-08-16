/** Branded id types. Nominal typing so a VenueId can never be passed as an ArenaId. */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Brand<string, "AccountId">;
export type VenueId = Brand<string, "VenueId">;
export type HouseholdId = Brand<string, "HouseholdId">;
/** A school or other org running closed-graph sessions. See ADR-0008. */
export type InstitutionId = Brand<string, "InstitutionId">;
export type ArenaId = Brand<string, "ArenaId">;
export type SessionId = Brand<string, "SessionId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type TeamId = Brand<string, "TeamId">;
export type EventId = Brand<string, "EventId">;
export type DeviceId = Brand<string, "DeviceId">;
export type SkuId = Brand<string, "SkuId">;
export type PartnerId = Brand<string, "PartnerId">;
export type ConsentId = Brand<string, "ConsentId">;
export type ObstructionId = Brand<string, "ObstructionId">;
export type ZoneId = Brand<string, "ZoneId">;
export type DoorId = Brand<string, "DoorId">;
