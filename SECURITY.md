# Reporting a security problem

Use GitHub's private vulnerability reporting on this repository: the **Security** tab, then **Report a
vulnerability**. Say what the program did, which version (`vrt-uploader --version`) and how to see it again.
You will get an answer within a week.

Please do not open a public issue for anything that exposes another guild's data or another person's PC.

## What counts

- The uploader reading, sending or keeping anything the [README](README.md#privacy) does not list.
- A way to make it send a guild's data somewhere other than the site its upload code names.
- A way to make it run something it should not, or to change what it starts at logon beyond its own entry.
- A release file that does not match its SHA-256 sum or whose signature does not verify.

The site the uploader sends to (the hub) is a separate, closed program with its own owner; problems there go to
the guildmaster of the guild whose site it is, through that guild's Discord.

## Supported versions

Only the latest release is supported. An older uploader keeps working until the site stops accepting its format,
which the site announces on the uploader's own log line.
