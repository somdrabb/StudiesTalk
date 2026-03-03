# Jitsi + TURN Foundation for meet.studistalk.de

## Architecture goals
- Build **meet.studistalk.de** as an Ubuntu 22.04+ all-in-one Jitsi Meet stack (Prosody, Jicofo, JVB, Nginx) using the official quickstart so TLS, media ports, and the standard web UI work before we embed the repo’s announcements interface. citeturn1search0
- Run **turn.studistalk.de** as a dedicated Coturn relay so users stuck behind strict Wi-Fi/NAT can connect through authenticated TURN lines that Prosody advertises to Jitsi clients. citeturn2search5turn2search0

## Step A – All-in-one Jitsi VM (meet.studistalk.de)
1. **Platform & prerequisites:** Follow the quickstart for Debian/Ubuntu 22.04+, enable `universe`, and install `gnupg2`, `curl`, `sudo`, `nginx-full`, Java 17, and the other required packages before adding the Jitsi repositories. citeturn1search0
2. **Domain and DNS:** Create an `A` record for `meet.studistalk.de`, set the hostname on the VM, and verify the fully qualified domain name so the installer accepts it. citeturn1search0
3. **Repositories & install:** Add the Prosody and Jitsi package repositories, `apt update`, then run `sudo apt install jitsi-meet` so the installer configures Nginx, Prosody, Jicofo, and JVB for you. citeturn1search0
4. **TLS certificate:** Opt into Let’s Encrypt when prompted so browsers and mobile clients trust the service without warnings. citeturn1search0
5. **Firewall:** Allow TCP 80/443, UDP 10000, and plan for UDP 3478/TCP 5349 once Coturn is online to keep STUN/TURN traffic reachable. citeturn1search0
6. **“Secure by default” meeting policy:**
   - Set `authentication = "internal_hashed"` on the main virtual host and add a `guest` virtual host so only authenticated users create rooms while anonymous guests still join afterward. citeturn0search0
   - Use the documented `lobby` object plus `securityUi` options so moderators can auto-knock guests, surface lobby chat, and hide/show the lobby button as needed. citeturn6view0
   - Optionally switch to JWT authentication (`authentication = "token"`, configure `app_id`/`app_secret`, restart Prosody/Jicofo/JVB, and mint tokens) so embedded experiences can grant moderator rights or room scoping via signed claims. citeturn0search1
7. **Validation:** After install, visit `https://meet.studistalk.de`, check the TLS lock, join a test meeting, and monitor `/var/log/jitsi/jicofo.log`, `/var/log/jitsi/jvb.log`, and `/var/log/prosody/prosody.log`. citeturn1search0

## Step B – TURN server (turn.studistalk.de)
1. **Purpose:** Coturn relays media for clients behind restrictive NAT/firewalls and is the standard fallback when direct peer-to-peer or JVB connections fail. citeturn2search5
2. **Install on Ubuntu:** `sudo apt update`, `sudo apt install -y coturn`, set `TURNSERVER_ENABLED=1` in `/etc/default/coturn`, and `sudo systemctl enable --now coturn` so it restarts automatically. citeturn2search5
3. **Firewall/ports:** Open UDP/TCP 3478, plus the UDP relay range (49152–65535) and TCP/UDP 5349 if you want TLS-encrypted TURN alongside UDP. citeturn2search3
4. **Coturn config:**
   - Configure `realm=turn.studistalk.de`, enable `use-auth-secret`, and set `static-auth-secret` to the same strong shared key Prosody will use. citeturn2search9
   - Enable Prosody’s `turn_external` module, point `turn_external_host`/`turn_external_secret` to the relay, and keep the advertised TTL/port defaults unless you use custom ports. citeturn2search0
   - Load the Let’s Encrypt certificate pair so TCP/UDP 5349 works as a TLS fallback when UDP 3478 is blocked. citeturn2search3
5. **Credential flow:** `mod_turncredentials` (or `turn_external`) delivers time-limited XEP-0215 credentials, so you never expose long-lived usernames/passwords in the UI. citeturn3search0

## Step C – Linking Jitsi to TURN
1. **Config overrides:** Set `p2p.useStunTurn = true` and `useStunTurn = true` in `/etc/jitsi/meet/meet.studistalk.de-config.js` so every peer and the JVB fetch the TURN lines Prosody publishes. citeturn4search0
2. **Transport policy:** Force relay-only connections during testing by appending `#config.p2p.iceTransportPolicy="relay"` (or setting the same option in `config.js`) and confirm that `chrome://webrtc-internals` shows your TURN host in the `iceServers` section. citeturn7search8
3. **Credentials:** Keep `turn_external_secret` and Coturn’s `static-auth-secret` synchronized, and restart `prosody`, `jicofo`, and `jitsi-videobridge2` whenever you rotate the key. citeturn2search0
4. **Monitoring:** In addition to the Chrome ICE logs, use Trickle ICE or other STUN/TURN testing tools to validate the allocations while checking Coturn and JVB logs for ICE failures before changing firewall rules. citeturn7search8

## Testing & next steps
- **Connectivity:** From outside the cloud, verify UDP 10000, TCP 443, and Coturn ports (3478 + 49152–65535) using a browser plus the Trickle ICE sample or `nc` to confirm the ports are reachable. citeturn1search0turn2search3
- **Security review:** Confirm lobby/password/JWT policies behave so authenticated hosts still control admissions and anonymous guests cannot create rooms without moderation. citeturn0search0turn6view0
- **Future integrations:** With JWT in place, the repo’s announcements UI or upcoming widgets can mint tokens via `app_id`/`app_secret` so embedded meetings inherit the same secure defaults. citeturn0search1

## Option B – Scaling with additional JVB nodes
1. **Architecture:** Keep `meet.studistalk.de` as the main node running Prosody, Jicofo, and the web UI, then add `jvb-*.studistalk.de` hosts that run only `jitsi-videobridge2`. Your app continues to embed `https://meet.studistalk.de/ROOM`, and Jicofo automatically distributes rooms across bridges as they register.
2. **DNS & certificates:** Add `A` records for each bridge (e.g., `jvb-1`, `jvb-2`). Issue TLS certs for those hostnames if you expose stats endpoints or if bridges need mutual TLS when connecting back to Prosody/Jicofo.
3. **Bridge installation:** On every bridge VM, install `jitsi-videobridge2` from the same repository, configure the shared authentication key/credentials, and open UDP 10000 plus any TCP ports you expose for harvesting. Bridges need the same `org.jitsi.videobridge.rest` and XMPP settings so they can reach Jicofo over the pubsub MUC.
4. **Jicofo config:** Ensure the bridge MUC (`JvbBrewery@internal.auth.meet.studistalk.de` by default) is discoverable and restart Jicofo so it re-subscribes. If you define custom bridge hosts, add them to `/etc/jitsi/jicofo/sip-communicator.properties` via `org.jitsi.jicofo.BRIDGE_MUC` or related overrides.
5. **Health & scaling:** Monitor `/var/log/jitsi/jicofo.log` and each bridge’s `jvb.log` for registrations. Use the JVB stats APIs (e.g., `/colibri/stats`) to observe load and spin up new bridges when room counts or CPU creep up—no app-side changes are required, just DNS + config updates and service restarts.
