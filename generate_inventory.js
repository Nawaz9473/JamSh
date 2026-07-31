const fs = require('fs');
const path = require('path');

// Helper to escape XML special characters
function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const workbook = {
  styles: `
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="11" ss:Color="#1F2937"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TabHeader">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#F59A18" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="ColHeader">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#27272A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#52525B"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#52525B"/>
      </Borders>
    </Style>
    <Style ss:ID="SectionHeader">
      <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
      <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#F59A18"/>
      <Interior ss:Color="#FAF5FF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#F59A18"/>
      </Borders>
    </Style>
    <Style ss:ID="CellNormal">
      <Alignment ss:Vertical="Top" ss:Horizontal="Left" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
      </Borders>
    </Style>
    <Style ss:ID="CellBold">
      <Alignment ss:Vertical="Top" ss:Horizontal="Left" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1F2937"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusLive">
      <Alignment ss:Vertical="Top" ss:Horizontal="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#047857"/>
      <Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusPartial">
      <Alignment ss:Vertical="Top" ss:Horizontal="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#B45309"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusSim">
      <Alignment ss:Vertical="Top" ss:Horizontal="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#1D4ED8"/>
      <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/>
      </Borders>
    </Style>
  `,
  sheets: []
};

// Sheet 1: Project Overview
const sheetOverview = {
  name: "Overview & Metadata",
  columns: [
    { width: 150 }, // Attribute
    { width: 500 }  // Value / Detail
  ],
  rows: [
    {
      style: "Title",
      height: 40,
      cells: [
        { value: "JAMSH SYSTEM INVENTORY OVERVIEW", mergeAcross: 1 }
      ]
    },
    {
      style: "Default",
      height: 15,
      cells: [{ value: "" }, { value: "" }]
    },
    {
      style: "TabHeader",
      height: 25,
      cells: [{ value: "System Attribute", mergeAcross: 0 }, { value: "Project Layout Details", mergeAcross: 0 }]
    },
    { cells: ["Project Name", "JamSh Monorepo (Hybrid E2EE Messaging & Social Media Platform)"] },
    { cells: ["OS Target Platforms", "Web client (Vite React Native Web) and Mobile client placeholders (Expo/Capacitor for Android & iOS)"] },
    { cells: ["Offline Transport Layer", "Native P2P via a custom Capacitor plugin 'JamshNearby' running Local TCP Socket servers/clients & UDP beacons"] },
    { cells: ["Online Sync Provider", "Supabase Client & Auth + PostgreSQL DB (Prisma Schema Integration)"] },
    { cells: ["Real-time Server Gateway", "NestJS Gateway using Socket.io WebSocket server, backed by Redis clusters for presence monitoring"] },
    { cells: ["Cryptographic Standard", "X25519 Elliptic Curve Diffie-Hellman Key Exchange (E2EE Pairwise) + AES-GCM (Authenticated Encrypted Envelopes)"] },
    { cells: ["Authentication Support", "Email/Password signups, Google OAuth, Phone SMS OTP, and reset recovery hooks"] },
    { cells: ["Monorepo Workspace Layout", "• apps/web: Core frontend React Native Web client\n• apps/mobile: Expo hybrid mobile placeholder\n• apps/api-server: NestJS API server\n• apps/testing-e2e: Playwright testing harness\n• packages/api: Client API SDK\n• packages/encryption: Shared cryptographic methods\n• packages/shared: Data validations & filters\n• packages/types: Common Typescript definitions\n• packages/ui: Design theme constants"] },
    { cells: ["Compilation & Setup Commands", "• Install: npm install\n• Build: npm run build\n• Dev Web Client: npm run dev --workspace @jamsh/web\n• Capacitor Sync: npm run cap:sync\n• Run Playwright Tests: npx playwright test"] }
  ].map(r => {
    // If not having custom style, apply defaults
    if (!r.style) {
      return {
        ...r,
        cells: [
          { value: r.cells[0], style: "CellBold" },
          { value: r.cells[1], style: "CellNormal" }
        ]
      };
    }
    return r;
  })
};
workbook.sheets.push(sheetOverview);

// Helper for standard sheets containing table data
function createTableSheet(name, headers, columns, data) {
  const rows = [];
  // Title Row
  rows.push({
    style: "Title",
    height: 35,
    cells: [{ value: name.toUpperCase() + " FEATURES LEDGER", mergeAcross: headers.length - 1 }]
  });
  // Empty space
  rows.push({
    style: "Default",
    height: 10,
    cells: Array(headers.length).fill({ value: "" })
  });
  // Headers Row
  rows.push({
    style: "Default",
    height: 25,
    cells: headers.map(h => ({ value: h, style: "ColHeader" }))
  });

  // Data rows
  data.forEach(item => {
    if (item.type === 'section') {
      rows.push({
        style: "Default",
        height: 25,
        cells: [
          { value: item.title, style: "SectionHeader", mergeAcross: headers.length - 1 }
        ]
      });
    } else {
      const cells = [];
      cells.push({ value: item.id, style: "CellBold" });
      cells.push({ value: item.module, style: "CellNormal" });
      cells.push({ value: item.feature, style: "CellBold" });
      
      // Status formatting
      let statusStyle = "CellNormal";
      if (item.status.includes("Fully") || item.status.includes("Native")) statusStyle = "StatusLive";
      else if (item.status.includes("Simulated") || item.status.includes("Mock")) statusStyle = "StatusSim";
      else if (item.status.includes("Partial")) statusStyle = "StatusPartial";
      cells.push({ value: item.status, style: statusStyle });
      
      cells.push({ value: item.details, style: "CellNormal" });
      cells.push({ value: item.code, style: "CellNormal" });

      rows.push({
        style: "Default",
        height: 55, // Fixed height for rows to wrap text nicely
        cells: cells
      });
    }
  });

  return { name, columns, rows };
}

// Sheet 2: Native P2P & Cryptography
const headersP2PCrypto = ["ID", "Module", "Feature Name", "Status", "Working Mechanism & Security Controls", "Primary Code Reference"];
const columnsP2PCrypto = [
  { width: 60 },  // ID
  { width: 100 }, // Module
  { width: 160 }, // Feature Name
  { width: 140 }, // Status
  { width: 440 }, // Mechanism
  { width: 220 }  // Code Reference
];
const dataP2PCrypto = [
  { type: 'section', title: '1. Capacitor Native Offline Transport Layer' },
  {
    id: "P2P-01",
    module: "Nearby Transport",
    feature: "Local TCP Server",
    status: "Native Integration",
    details: "Listens for direct socket communication over local Wi-Fi/Hotspot networks on port 8383 inside Android (Java) and iOS (Swift) Plugins. Emits 'messageReceived' events carrying encrypted envelopes to the frontend.",
    code: "JamshNearbyPlugin.java:L317-365\nJamshNearbyPlugin.swift:L217-243"
  },
  {
    id: "P2P-02",
    module: "Nearby Transport",
    feature: "Local TCP Client",
    status: "Native Integration",
    details: "Initiates socket connections to recipient peer's IP address on port 8383 to transmit encrypted envelope packets and read validated cryptographic ACK signals.",
    code: "JamshNearbyPlugin.java:L451-489\nJamshNearbyPlugin.swift:L354-411"
  },
  {
    id: "P2P-03",
    module: "Nearby Transport",
    feature: "UDP Beacon Advertising",
    status: "Native Integration",
    details: "Broadcasts a list of up to 5 rotating contact pseudonymous tokens derived via HMAC-SHA256 on port 8384 every 3 seconds to advertise local device presence.",
    code: "JamshNearbyPlugin.java:L190-226\nJamshNearbyPlugin.swift:L109-158"
  },
  {
    id: "P2P-04",
    module: "Nearby Transport",
    feature: "UDP Beacon Scanning",
    status: "Native Integration",
    details: "Listens to UDP port 8384, decodes presence strings, identifies peer IP addresses, and alerts WebView via 'peerDiscovered' events. Requests Android MulticastLock to bypass system-level packet drops.",
    code: "JamshNearbyPlugin.java:L243-310\nJamshNearbyPlugin.swift:L160-201"
  },
  {
    id: "P2P-05",
    module: "Nearby Transport",
    feature: "Length-Prefixed Framing",
    status: "Native Integration",
    details: "Encodes network packets in a '[4-byte big-endian length-prefix][JSON payload]' frame. Sockets evaluate size (max 1MB) before allocating memory buffers to block resource exhaustion bugs.",
    code: "JamshNearbyPlugin.java:L490-532\nJamshNearbyPlugin.swift:L413-457"
  },
  {
    id: "P2P-06",
    module: "Nearby Transport",
    feature: "Connection Rate Limits",
    status: "Native Integration",
    details: "Limits active pending server sockets to a global maximum of 10 concurrent connections, and throttling per-source IP to 2 concurrent sockets to protect against Local Denial of Service.",
    code: "JamshNearbyPlugin.java:L370-386\nJamshNearbyPlugin.swift:L255-284"
  },
  {
    id: "P2P-07",
    module: "Nearby Transport",
    feature: "Background Auto-Eviction TTL",
    status: "Native Integration",
    details: "Registers an auto-eviction timer on socket creation. Closes connections automatically after 15 seconds if no ACK/NACK has been written, preventing server thread lockups.",
    code: "JamshNearbyPlugin.java:L397-405\nJamshNearbyPlugin.swift:L305-311"
  },
  {
    id: "P2P-08",
    module: "Nearby Transport",
    feature: "Atomic Response Close",
    status: "Native Integration",
    details: "Removes connection socket atomically from the active map and closes it under all execution paths once respondToEnvelope is called to prevent multi-response replay conditions.",
    code: "JamshNearbyPlugin.java:L430-447\nJamshNearbyPlugin.swift:L328-351"
  },
  { type: 'section', title: '2. Cryptographic Security & E2E Encrypted Controls' },
  {
    id: "CRY-01",
    module: "Cryptography",
    feature: "Pairwise E2EE Logic",
    status: "Fully Working",
    details: "Derives pairwise shared secret keys between sender and recipient device keys using Diffie-Hellman (X25519). Encrypts the JSON envelope plaintext using authenticated AES-GCM encryption with unique nonces.",
    code: "packages/encryption/src/index.ts\npackages/api/src/index.ts:L1578-1591"
  },
  {
    id: "CRY-02",
    module: "Cryptography",
    feature: "Secure Hardware Keystore",
    status: "Native Integration",
    details: "Encrypts user key pairs using Android KeyStore provider with AES/GCM/NoPadding, storing encrypted blobs in SharedPreferences. iOS handles keys directly inside Apple Keychain.",
    code: "JamshNearbyPlugin.java:L81-184\nJamshNearbyPlugin.swift:L35-103"
  },
  {
    id: "CRY-03",
    module: "Cryptography",
    feature: "Key Migration Ledger",
    status: "Fully Working",
    details: "Detects legacy E2EE keypairs in LocalStorage on native app startup. Migrates them atomically to the hardware-backed keystore/keychain, verifies consistency, and purges the unsecure copies.",
    code: "packages/api/src/index.ts:L1901-1920"
  },
  {
    id: "CRY-04",
    module: "Cryptography",
    feature: "HMAC Rotating Beacons",
    status: "Fully Working",
    details: "Protects UDP broadcast privacy by calculating 16-character beacon tokens via HMAC-SHA256(SharedSecret, Epoch), refreshing every 15 minutes. Scanners compute the same to recognize peer identities.",
    code: "packages/api/src/index.ts:L1057-1088\npackages/api/src/index.ts:L1127-1142"
  },
  {
    id: "CRY-05",
    module: "Cryptography",
    feature: "Beacon Correlation Throttling",
    status: "Fully Working",
    details: "Batches rotating contact beacons in groups of 5 per UDP packet. Rotates batches every 30 seconds to bypass standard 512-byte MTU caps and prevent observers from linking multiple tokens to a single device.",
    code: "packages/api/src/index.ts:L1071-1091"
  },
  {
    id: "CRY-06",
    module: "Cryptography",
    feature: "Sender Cryptographic Binding",
    status: "Fully Working",
    details: "Rejects incoming offline messages if the sender's public key is not cached from a previous online synchronization (prevents first-time chat spoofing offline). Decryption success confirms authenticity.",
    code: "packages/api/src/index.ts:L1251-1288"
  },
  {
    id: "CRY-07",
    module: "Cryptography",
    feature: "Purpose-Separated ACKs",
    status: "Fully Working",
    details: "Recipients derive an ACK-specific key via HMAC-SHA256(SharedSecret, 'jamsh-ack-key'). Signs a canonical context string: 'v1|length(msgId):msgId|SUCCESS|length(userId):userId' to prevent cross-protocol replays.",
    code: "packages/api/src/index.ts:L1318-1340\npackages/api/src/index.ts:L1645-1669"
  }
];
const sheetP2PCrypto = createTableSheet("P2P & Cryptography", headersP2PCrypto, columnsP2PCrypto, dataP2PCrypto);
workbook.sheets.push(sheetP2PCrypto);

// Sheet 3: Offline Database & Chat Gateway
const headersOfflineChat = ["ID", "Module", "Feature Name", "Status", "Working Mechanism & Sync Controls", "Primary Code Reference"];
const columnsOfflineChat = [
  { width: 60 },  // ID
  { width: 100 }, // Module
  { width: 160 }, // Feature Name
  { width: 140 }, // Status
  { width: 440 }, // Mechanism
  { width: 220 }  // Code Reference
];
const dataOfflineChat = [
  { type: 'section', title: '1. SQLite Local Offline Message Queue' },
  {
    id: "OFL-01",
    module: "Queue Service",
    feature: "Local SQLite Queue",
    status: "Native Integration",
    details: "Manages unsent message envelopes locally in native SQLite database (jamsh_offline_queue.db) using tables mapping message_id, room_id, recipient_id, and serialized envelope JSON payloads.",
    code: "JamshNearbyPlugin.java:L659-720\nJamshNearbyPlugin.swift:L462-566"
  },
  {
    id: "OFL-02",
    module: "Queue Service",
    feature: "Web Fallback Storage",
    status: "Fully Working",
    details: "Provides transparent fallback to LocalStorage queue arrays if the application is running in a standard web browser instead of a native Android or iOS application.",
    code: "packages/api/src/index.ts:L981-1030"
  },
  {
    id: "OFL-03",
    module: "Queue Service",
    feature: "Network Monitor Hooks",
    status: "Fully Working",
    details: "Registers OS-level callbacks (Android ConnectivityManager NetworkCallback and iOS NWPathMonitor). Triggers automatic queue resync once internet status shifts back to 'online'.",
    code: "JamshNearbyPlugin.java:L608-638\nJamshNearbyPlugin.swift:L580-589"
  },
  {
    id: "OFL-04",
    module: "Queue Service",
    feature: "Idempotent Queue Sync",
    status: "Fully Working",
    details: "Iterates through SQLite database entries upon online transition. POSTs envelopes to the remote Supabase API. Deletes successfully uploaded envelopes from the local database.",
    code: "packages/api/src/index.ts:L1172-1219"
  },
  {
    id: "OFL-05",
    module: "Queue Service",
    feature: "Duplicate Sync Reconciliation",
    status: "Fully Working",
    details: "If a peer synchronizes the message online first, the server returns a duplicate key conflict (PostgreSQL code 23505). The local sync logic resolves this conflict by deleting the item from the queue.",
    code: "packages/api/src/index.ts:L1203-1209"
  },
  { type: 'section', title: '2. WebSocket Real-Time Chat & Signalling' },
  {
    id: "WSG-01",
    module: "Chat Gateway",
    feature: "WebSocket Server Setup",
    status: "Fully Working",
    details: "NestJS WebSocket gateway handling real-time peer communication via Socket.io. Configured with CORS allowance and query handshake filters.",
    code: "chat.gateway.ts:L15-28"
  },
  {
    id: "WSG-02",
    module: "Chat Gateway",
    feature: "Presence & Redis Sync",
    status: "Fully Working",
    details: "Tracks connected socket IDs in memory. Updates Redis statuses ('online' / 'offline') and broadcasts updates ('user_status') to all active socket clients.",
    code: "chat.gateway.ts:L29-54"
  },
  {
    id: "WSG-03",
    module: "Chat Gateway",
    feature: "Real-Time Message Relay",
    status: "Fully Working",
    details: "Relays E2EE message payloads instantly to online recipients and transmits socket delivery receipts ('message_delivered') back to the sender.",
    code: "chat.gateway.ts:L56-78"
  },
  {
    id: "WSG-04",
    module: "Chat Gateway",
    feature: "Typing Status Indicators",
    status: "Fully Working",
    details: "Broadcasts typing statuses ('typing_status') between active room members to display visual markers on the UI.",
    code: "chat.gateway.ts:L80-88"
  },
  {
    id: "WSG-05",
    module: "Chat Gateway",
    feature: "WebRTC Signalling Bridge",
    status: "Fully Working",
    details: "Exposes events (call_dial, call_sdp_offer, call_sdp_answer, call_ice_candidate, call_hangup) to relay WebRTC messages between dialing peers, establishing direct P2P media tunnels.",
    code: "chat.gateway.ts:L90-137"
  }
];
const sheetOfflineChat = createTableSheet("Sync & Chat Gateway", headersOfflineChat, columnsOfflineChat, dataOfflineChat);
workbook.sheets.push(sheetOfflineChat);

// Sheet 4: Social & Creator Features
const headersSocialCreator = ["ID", "Module", "Feature Name", "Status", "Working Mechanism & Data Handlers", "Primary Code Reference"];
const columnsSocialCreator = [
  { width: 60 },  // ID
  { width: 100 }, // Module
  { width: 160 }, // Feature Name
  { width: 140 }, // Status
  { width: 440 }, // Mechanism
  { width: 220 }  // Code Reference
];
const dataSocialCreator = [
  { type: 'section', title: '1. Social Media Engine (Feed, Interactions, Stories)' },
  {
    id: "SOC-01",
    module: "Social Engine",
    feature: "Follow Filtered Feed",
    status: "Fully Working",
    details: "Queries follow lists (UserProfile relations). Loads posts published by followed profiles first, then falls back to chronological public posts.",
    code: "feed.service.ts:L8-51\npackages/api/src/index.ts:L651-717"
  },
  {
    id: "SOC-02",
    module: "Social Engine",
    feature: "Text & Carousel Posts",
    status: "Fully Working",
    details: "Creates user posts containing captions or linked media assets (images/videos). Stores media attachments inside PostMedia relations with positional order coordinates.",
    code: "feed.service.ts:L53-80\npackages/api/src/index.ts:L719-761"
  },
  {
    id: "SOC-03",
    module: "Social Engine",
    feature: "Thunder Reactions",
    status: "Fully Working",
    details: "Customizes reactions using 'Thunders'. Creates/deletes entries inside ThunderReaction schema and updates the parent Post/Comment counter atomically.",
    code: "feed.service.ts:L82-136\npackages/api/src/index.ts:L763-830"
  },
  {
    id: "SOC-04",
    module: "Social Engine",
    feature: "Comment Threading",
    status: "Fully Working",
    details: "Allows users to add comments to posts. Supports parent_id associations to create threaded comment replies, auto-incrementing post comment count records.",
    code: "feed.service.ts:L138-155\nApp.tsx:L618-660"
  },
  {
    id: "SOC-05",
    module: "Social Engine",
    feature: "24h Ephemeral Stories",
    status: "Fully Working",
    details: "Enables creating image/video stories. Applies 24-hour expiration dates (expiresAt = now + 24h) and filters active items dynamically on query.",
    code: "feed.service.ts:L157-176\nApp.tsx:L1111-1120"
  },
  {
    id: "SOC-06",
    module: "Social Engine",
    feature: "Follow Relationships",
    status: "Fully Working",
    details: "Enables follow/unfollow operations. Mapped through FollowRelation tables. Supports account privacy states ('pending' vs 'accepted' follow status).",
    code: "packages/api/src/index.ts:L836-941"
  },
  {
    id: "SOC-07",
    module: "Social Engine",
    feature: "Content Abuse Reports",
    status: "Fully Working",
    details: "Creates incident reports against user profiles, posts, or comments specifying reasons. Dispatched to the administrative review database queue.",
    code: "feed.service.ts:L178-191\nApp.tsx:L47-51"
  },
  { type: 'section', title: '2. Creator Space & Subscription Content' },
  {
    id: "CRE-01",
    module: "Creator Space",
    feature: "Creator Channels",
    status: "Fully Working",
    details: "Registers user profiles as creators. Restricts ownership to a single channel per account via database unique constraints.",
    code: "creator.service.ts:L12-26\nApp.tsx:L10-14"
  },
  {
    id: "CRE-02",
    module: "Creator Space",
    feature: "Exclusive Paid Content",
    status: "Fully Working",
    details: "Enables uploading channel items labeled as 'isExclusive' along with custom purchase unlock price tags (decimal pricing structures).",
    code: "creator.service.ts:L28-46\nApp.tsx:L16-28"
  },
  {
    id: "CRE-03",
    module: "Creator Space",
    feature: "Redis Purchase Ledger",
    status: "Fully Working",
    details: "Maintains purchase records inside Redis key-value stores. Checks user unlock maps ('user:purchase:userId:contentId') to authorize content views.",
    code: "creator.service.ts:L48-69"
  },
  {
    id: "CRE-04",
    module: "Creator Space",
    feature: "Unlock Purchase Flow",
    status: "Fully Working",
    details: "Processes exclusive content item unlocks, registering purchase confirmations inside the Redis ledger.",
    code: "creator.service.ts:L71-80"
  }
];
const sheetSocialCreator = createTableSheet("Social & Creator Features", headersSocialCreator, columnsSocialCreator, dataSocialCreator);
workbook.sheets.push(sheetSocialCreator);

// Sheet 5: Admin Desk & Frontend UI
const headersAdminUI = ["ID", "Module", "Feature Name", "Status", "Working Mechanism & UI Components", "Primary Code Reference"];
const columnsAdminUI = [
  { width: 60 },  // ID
  { width: 100 }, // Module
  { width: 160 }, // Feature Name
  { width: 140 }, // Status
  { width: 440 }, // Mechanism
  { width: 220 }  // Code Reference
];
const dataAdminUI = [
  { type: 'section', title: '1. Administrative Moderation Desk' },
  {
    id: "ADM-01",
    module: "Moderation",
    feature: "Abuse Queue Viewer",
    status: "Fully Working",
    details: "Fetches user-submitted abuse reports, embedding details on reporters, reported targets, post details, and comments.",
    code: "admin.service.ts:L8-18\nApp.tsx:L1723-1756"
  },
  {
    id: "ADM-02",
    module: "Moderation",
    feature: "Resolution Actions",
    status: "Fully Working",
    details: "Processes content actions: 'ignore' resolves flags; 'restrict' unverifies users and flags bios; 'delete' removes comment/post rows permanently.",
    code: "admin.service.ts:L20-48"
  },
  {
    id: "ADM-03",
    module: "Moderation",
    feature: "Platform Statistics",
    status: "Fully Working",
    details: "Computes counts (total user profiles, published post counts, total comments, and active pending flags) for executive dashboards.",
    code: "admin.service.ts:L50-64"
  },
  { type: 'section', title: '2. Web Frontend Application (Vite / React Native Web)' },
  {
    id: "UIF-01",
    module: "Web Interface",
    feature: "Responsive Sidebar/Bottom",
    status: "Fully Working",
    details: "Implements dark theme (Instagram style) with responsive layout rules, rendering a persistent sidebar on desktop and a bottom navigation bar on mobile viewports (< 768px).",
    code: "App.tsx:L967-1100\nApp.tsx:L1862-2008"
  },
  {
    id: "UIF-02",
    module: "Web Interface",
    feature: "Multi-Auth Gateways",
    status: "Fully Working",
    details: "Provides login and signup panels. Supports email, phone SMS OTP validation, password resets, and Google OAuth credentials authentication.",
    code: "App.tsx:L149-164\nApp.tsx:L750-960"
  },
  {
    id: "UIF-03",
    module: "Web Interface",
    feature: "E2EE Chat Interface",
    status: "Fully Working",
    details: "Inbox layout listing chat rooms and direct chat streams. Emphasizes security by displaying plain decrypted text bubble overlays directly above their base64 AES-GCM ciphertexts.",
    code: "App.tsx:L1367-1568\nApp.tsx:L2455-2584"
  },
  {
    id: "UIF-04",
    module: "Web Interface",
    feature: "E2EE Trust Drawer",
    status: "Fully Working",
    details: "Renders cryptographic handshake summaries in active chats, printing local and remote device public keys to verify communication trust.",
    code: "App.tsx:L1455-1460"
  },
  {
    id: "UIF-05",
    module: "Web Interface",
    feature: "Live Stream Simulator",
    status: "Simulated",
    details: "Tab allows users to create mock streams. Displays viewer count metrics, hosts a simulated player, and handles live comments chat updates.",
    code: "App.tsx:L1660-1720"
  },
  {
    id: "UIF-06",
    module: "Web Interface",
    feature: "WebRTC Video/Voice Simulator",
    status: "Simulated Logs UI",
    details: "Simulates WebRTC connections via sequential state logs (sdp offer, answer, and ICE tunnel confirmations) overlaid inside interactive calling screens.",
    code: "App.tsx:L697-724\nApp.tsx:L1760-1781"
  },
  {
    id: "UIF-07",
    module: "Web Interface",
    feature: "Vlog Reels Simulator",
    status: "Simulated Player",
    details: "Shorts tab displays simulated vertical player, mock creator follow toggles, reels descriptions, and interactions metrics overlay.",
    code: "App.tsx:L1327-1365\nApp.tsx:L2322-2393"
  }
];
const sheetAdminUI = createTableSheet("Admin & Web UI Features", headersAdminUI, columnsAdminUI, dataAdminUI);
workbook.sheets.push(sheetAdminUI);

// Build final XML string
let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Antigravity AI Assistant</Author>
    <LastAuthor>Antigravity AI Assistant</LastAuthor>
    <Created>${new Date().toISOString()}</Created>
    <Version>16.00</Version>
  </DocumentProperties>
  <Styles>
    ${workbook.styles}
  </Styles>
`;

workbook.sheets.forEach(sheet => {
  xml += `  <Worksheet ss:Name="${escapeXml(sheet.name)}">\n    <Table>\n`;
  // Columns
  sheet.columns.forEach(col => {
    xml += `      <Column ss:Width="${col.width}"/>\n`;
  });
  // Rows
  sheet.rows.forEach(row => {
    const heightAttr = row.height ? ` ss:Height="${row.height}"` : '';
    const styleAttr = row.style ? ` ss:StyleID="${row.style}"` : '';
    xml += `      <Row${heightAttr}${styleAttr}>\n`;
    
    row.cells.forEach(cell => {
      const cellValue = (typeof cell === 'object') ? cell.value : cell;
      const cellStyle = (typeof cell === 'object' && cell.style) ? ` ss:StyleID="${cell.style}"` : '';
      const mergeAcross = (typeof cell === 'object' && cell.mergeAcross) ? ` ss:MergeAcross="${cell.mergeAcross}"` : '';
      
      const type = (typeof cellValue === 'number') ? 'Number' : 'String';
      const escaped = escapeXml(cellValue);
      
      xml += `        <Cell${cellStyle}${mergeAcross}><Data ss:Type="${type}">${escaped}</Data></Cell>\n`;
    });
    
    xml += `      </Row>\n`;
  });
  
  xml += `    </Table>\n  </Worksheet>\n`;
});

xml += `</Workbook>\n`;

const outPath = path.join(__dirname, 'JamSh_Features_Inventory.xls');
fs.writeFileSync(outPath, xml, 'utf8');
console.log(`[Success] Wrote Excel Features Inventory to: ${outPath}`);
