# node-watershed changelog

## not yet released

## 0.4.0

* Support for Websocket sub-protocol negotiation
* Documented `detached`/raw socket argument to `accept()`

## 0.3.4

* Receiving a ping would crash the WatershedConnection while trying to
  reply.
* Update to latest dtrace-provider

## 0.3.3

* Handle write-after-end errors when an attempt is made to write to a
  websocket that cannot be written to.

## 0.3.2

* Initial move to Joyent org plus make check
