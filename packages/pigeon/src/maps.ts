/*
 * Copyright (c) 2025 Andreas Michael
 * This software is under the Apache 2.0 License
 */

export const jsTypes = new Map<string, string>([
    ["bigint", "number"],
    ["int8", "number"],
    ["bigserial", "number"],
    ["serial8", "number"],
    ["bit", "Array"],
    ["bit varying", "Array"],
    ["varbit", "Array"],
    ["boolean", "boolean"],
    ["bool", "boolean"],
    ["box", ""],
    ["bytea", "Array"],
    ["character", "string"],
    ["char", "string"],
    ["character varying", "string"],
    ["varchar", "string"],
    ["cidr", "string"],
    ["circle", ""],
    ["date", "Date"],
    ["double precision", "number"],
    ["float8", "number"],
    ["inet", "string"],
    ["integer", "number"],
    ["int", "number"],
    ["int4", "number"],
    ["interval", ""],
    ["json", "string"],
    ["jsonb", "Array"],
    ["line", ""],
    ["lseg", ""],
    ["macaddr", "string"],
    ["macaddr8", "string"],
    ["money", "number"],
    ["numeric", "number"],
    ["decimal", "number"],
    ["path", ""],
    ["pg_lsn", "number"],
    ["pg_snapshot", ""],
    ["point", ""],
    ["polygon", ""],
    ["real", "number"],
    ["float4", "number"],
    ["smallint", "number"],
    ["int2", "number"],
    ["smallserial", "number"],
    ["serial2", "number"],
    ["serial", "number"],
    ["string4", "number"],
    ["text", "string"],
    ["time", ""],
    ["time without time zone", ""],
    ["time with time zone", ""],
    ["timetz", ""],
    ["timestamp", "Date"],
    ["timestamp without time zone", "Date"],
    ["timestamp with time zone", "Date"],
    ["timestamptz", "Date"],
    ["tsquery", ""],
    ["tsvector", ""],
    ["txid_snapshot", ""],
    ["uuid", "string"],
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