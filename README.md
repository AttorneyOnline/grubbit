# grubbit

Grubbit is a library designed to manage the retrieval of tiny, interdependent
files. Independently, these files are so small that the request time is longer
than the actual transfer time. This clogs up network traffic. This is,
unfortunately, not something that prefetching can fix.

So we bundle up the files into packages.

Instead of referencing files within each package by name, though, they are
always referenced by their hash (in other words, by a sampling of their actual
content). The reason is to allow for deduplication: multiple packages can
contain the same file.

## In AO land...

This is a library intended to be used in webAO as a drop-in replacement for raw
`fetch`. Fetching on-demand presents sprites about 50-200 ms late, and while
prefetching might solve the problem in the short term, the longer-term problem
is that AO doesn't have a decent asset system. This is the solution to that
longer-term problem.

In order for this to work, however, clients will need to have a hint of what the
hash of an emote or asset being presented is rather than its name. This will
require significant protocol changes, but that's fine. It can be done.
