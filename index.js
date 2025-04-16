const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const makeWASocket = require("@whiskeysockets/baileys").default;
    const qrcode = require("qrcode-terminal");
    const { Client, LocalAuth } = require("whatsapp-web.js");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Desactivamos el QR interno
    });

    sock.ev.on("connection.update", (update) => {
        const { qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true }); // Mostramos QR en consola de forma compatible con Replit
        }
        // ... lo demás se queda igual
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];

        if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return; // Solo grupos

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const metadata = await sock.groupMetadata(from);
        const isAdmin = metadata.participants.find(
            (p) => p.id === sender,
        )?.admin;

        const reply = (text) =>
            sock.sendMessage(from, { text }, { quoted: msg });

        // !cerrargrupo (solo admin)
        if (body === "!cerrar" && isAdmin) {
            await sock.groupSettingUpdate(from, "announcement");
            reply("✅ Grupo cerrado solo para administradores.");
        }

        if (body.startsWith("kick") && isAdmin && isBotAdmin) {
            const mentionedJid =
                m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

            if (!mentionedJid) {
                await sock.sendMessage(from, {
                    text: "Debes mencionar al usuario que deseas expulsar.",
                });
                return;
            }

            try {
                await sock.groupParticipantsUpdate(
                    from,
                    [mentionedJid],
                    "remove",
                );
                await sock.sendMessage(from, {
                    text: "Usuario expulsado correctamente.",
                });
            } catch (error) {
                console.error("Error al expulsar usuario:", error);
                await sock.sendMessage(from, {
                    text: "No se pudo expulsar al usuario.",
                });
            }
        }

        // !abrirgrupo (solo admin)
        if (body === "!abrir" && isAdmin) {
            await sock.groupSettingUpdate(from, "not_announcement");
            reply("✅ Grupo abierto para todos los miembros.");
        }

        // !todos
        if (body === "!todos" && isAdmin) {
            const waveEmoji = "🩸";
            const bloodEmoji = "🩸";
            const titulo = `${bloodEmoji} : *_LPZ SCRIMS_*`;
            const separador = "━━━━━━━━━━━━━━";
            const etiquetas = metadata.participants.map((p) => {
                const nombre = p?.notify || p?.name || ""; // nombre si está disponible
                const numero = p.id.split("@")[0];
                const display = nombre ? `@~${nombre}` : `@+${numero}`;
                return `${waveEmoji} ${display}`;
            });

            const texto = `${titulo}\n${separador}\n\n*_ETIQUETAS:_*\n\n${etiquetas.join("\n")}`;

            await sock.sendMessage(from, {
                text: texto,
                mentions: metadata.participants.map((p) => p.id),
            });
        }

        // !info
        if (body === "!info" && isAdmin) {
            reply(
                `📌 Nombre: ${metadata.subject}\n👥 Participantes: ${metadata.participants.length}`,
            );
        }

        // !expulsar @usuario (solo admin)
        if (body.startsWith("!ban") && isAdmin) {
            const mentioned =
                msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

            if (!mentioned || mentioned.length === 0) {
                reply("❌ Debes mencionar al usuario que deseas expulsar.");
                return;
            }

            const target = mentioned[0];
            const targetInfo = metadata.participants.find(
                (p) => p.id === target,
            );

            if (!targetInfo) {
                reply("❌ Usuario no encontrado en el grupo.");
                return;
            }

            if (targetInfo.admin) {
                reply("⛔ No puedo expulsar a un administrador.");
                return;
            }

            try {
                await sock.groupParticipantsUpdate(from, [target], "remove");
                reply(`👢 Usuario @${target.split("@")[0]} expulsado.`);
            } catch (error) {
                console.error("Error al expulsar:", error);
                reply("❌ No se pudo expulsar al usuario.");
            }
        }

        // !link
        if (body === "!link" && isAdmin) {
            const code = await sock.groupInviteCode(from);
            reply(`🔗 Enlace del grupo: https://chat.whatsapp.com/${code}`);
        }

        client.on("message", async (msg) => {
            if (!msg.body.startsWith(".n(") || !msg.body.endsWith(")")) return;

            const messageText = msg.body.slice(3, -1).trim();

            if (msg.isGroupMsg) {
                const chat = await msg.getChat();
                if (!chat.isGroup) return;

                // Obtener todos los participantes del grupo
                const mentions = chat.participants.map(
                    (participant) => participant.id._serialized,
                );

                // Enviar el mensaje con menciones ocultas
                await chat.sendMessage(messageText, {
                    mentions: mentions,
                });
            }
        });

        // !adminson
        if (body === "!adminson") {
            const admins = metadata.participants.filter((p) => p.admin);
            const list = admins.map((a) => `@${a.id.split("@")[0]}`).join("\n");
            await sock.sendMessage(from, {
                text: `🛡️ Admins:\n${list}`,
                mentions: admins.map((a) => a.id),
            });
        }
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("🔴 Sesión cerrada. Escanea de nuevo.");
                startBot(); // Reinicia
            } else {
                console.log("⚠️ Desconectado. Reconectando...");
                startBot();
            }
        }
    });
}
const http = require("http");
http.createServer((req, res) => res.end("Bot activo")).listen(3000);

startBot();
