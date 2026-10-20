# ADR-0005: Password hashing with node:crypto scrypt

Date: 2026-10-16. Owner: Group 1.

Passwords are hashed with scrypt from the Node standard library. The
parameters are N 16384, r 8, p 1 with a 64 byte key and a fresh 16
byte salt per secret. Comparison uses a timing-safe check.

Adding bcrypt would have pulled in a native dependency for something
the platform already does well. One less dependency means one less
supply chain to watch and a faster install for every group member.

Stored values carry a scrypt$ prefix with the salt and hash in hex.
A future move to another function would mean accepting both formats
during verification while new hashes use the new one.
