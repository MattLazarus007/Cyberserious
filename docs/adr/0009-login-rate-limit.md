# ADR-0009: In-memory login rate limit for the lab

Date: 2026-10-16. Owner: Group 1.

Failed sign-in attempts are capped at five per username per fifteen
minutes. The counter lives in server memory.

A shared table would survive restarts and suit multiple servers, but
the lab runs one server for markers. Memory keeps the mechanism
visible in one file. This lab values that visibility over restart
survival. The shortcut is noted where it lives in the code.

Production would move this into the database or the proxy in front
of the app. The route behaviour would not change.
