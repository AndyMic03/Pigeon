/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

export const jsTypes = new Map<string, string>([
    // Numeric Types
    ["smallint", "number"],
    ["int2", "number"],
    ["integer", "number"],
    ["int", "number"],
    ["bigint", "string"],
    ["int8", "string"],
    ["real", "number"],
    ["float4", "number"],
    ["double precision", "number"],
    ["float8", "string"],
    ["numeric", "string"],
    ["decimal", "string"],
    ["money", "string"],

    // Serial Types
    ["smallserial", "number"],
    ["serial2", "number"],
    ["serial", "number"],
    ["serial4", "number"],
    ["bigserial", "string"],
    ["serial8", "string"],

    // Character Types
    ["character", "string"],
    ["char", "string"],
    ["character varying", "string"],
    ["varchar", "string"],
    ["text", "string"],
    ["name", "string"],

    // Binary Types
    ["bytea", "Buffer"],
    ["bit", "string"],
    ["bit varying", "string"],
    ["varbit", "string"],

    // Boolean Type
    ["boolean", "boolean"],
    ["bool", "boolean"],

    // Date/Time Types
    ["date", "Date"],
    ["time without time zone", "string"],
    ["time", "string"],
    ["time with time zone", "string"],
    ["timetz", "string"],
    ["timestamp without time zone", "Date"],
    ["timestamp", "Date"],
    ["timestamp with time zone", "Date"],
    ["timestamptz", "Date"],
    ["interval", "object"],

    // Geometric Types
    ["box", "object"],
    ["circle", "object"],
    ["line", "object"],
    ["lseg", "object"],
    ["path", "object"],
    ["point", "object"],
    ["polygon", "object"],

    // Network Address Types
    ["cidr", "string"],
    ["inet", "string"],
    ["macaddr", "string"],
    ["macaddr8", "string"],

    // JSON Types
    ["json", "object"],
    ["jsonb", "object"],

    // UUID Type
    ["uuid", "string"],

    // Text Search Types
    ["tsquery", "string"],
    ["tsvector", "string"],

    // Other Types
    ["pg_lsn", "string"],
    ["pg_snapshot", "string"],
    ["txid_snapshot", "string"],
    ["xml", "string"],
]);

export const udtTypes: Map<string, string> = new Map<string, string>([
    // Numeric Types
    ["smallint", "int2"],
    ["int2", "int2"],
    ["integer", "int4"],
    ["int", "int4"],
    ["bigint", "int8"],
    ["int8", "int8"],
    ["real", "float4"],
    ["float4", "float4"],
    ["double precision", "float8"],
    ["float8", "float8"],
    ["numeric", "numeric"],
    ["decimal", "numeric"],
    ["money", "money"],

    // Serial Types
    ["smallserial", "int2"],
    ["serial", "int4"],
    ["bigserial", "int8"],

    // Character Types
    ["character", "bpchar"],
    ["char", "bpchar"],
    ["character varying", "varchar"],
    ["varchar", "varchar"],
    ["text", "text"],
    ["name", "name"],

    // Binary Types
    ["bytea", "bytea"],
    ["bit", "bit"],
    ["bit varying", "varbit"],
    ["varbit", "varbit"],

    // Boolean Type
    ["boolean", "bool"],
    ["bool", "bool"],

    // Date/Time Types
    ["date", "date"],
    ["time without time zone", "time"],
    ["time", "time"],
    ["time with time zone", "timetz"],
    ["timetz", "timetz"],
    ["timestamp without time zone", "timestamp"],
    ["timestamp", "timestamp"],
    ["timestamp with time zone", "timestamptz"],
    ["timestamptz", "timestamptz"],
    ["interval", "interval"],

    // Geometric Types
    ["box", "box"],
    ["circle", "circle"],
    ["line", "line"],
    ["lseg", "lseg"],
    ["path", "path"],
    ["point", "point"],
    ["polygon", "polygon"],

    // Network Address Types
    ["cidr", "cidr"],
    ["inet", "inet"],
    ["macaddr", "macaddr"],
    ["macaddr8", "macaddr8"],

    // JSON Types
    ["json", "json"],
    ["jsonb", "jsonb"],

    // UUID Type
    ["uuid", "uuid"],

    // Text Search Types
    ["tsquery", "tsquery"],
    ["tsvector", "tsvector"],

    // Other Types
    ["pg_lsn", "pg_lsn"],
    ["pg_snapshot", "pg_snapshot"],
    ["txid_snapshot", "txid_snapshot"],
    ["xml", "xml"],
]);