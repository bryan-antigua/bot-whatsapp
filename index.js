const {
    default: makeWASocket,
    useSingleFileAuthState,
    DisconnectReason,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const qrcode = require("qrcode-terminal");

async function startBot() {
    const { state, saveState } = useSingleFileAuthState("auth_info.json");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // No mostrar QR automáticamente
    });

    let currentQR = null; // Guardamos el QR para mostrarlo luego

    sock.ev.on("connection.update", (update) => {
        const { qr, connection, lastDisconnect } = update;

        if (qr) {
            currentQR = qr; // Guardamos el QR actual en memoria
            console.log("📷 QR generado. Usá el comando !qr para verlo.");
        }

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("🔴 Sesión cerrada. Escanea de nuevo.");
                startBot();
            } else {
                console.log("⚠️ Desconectado. Reconectando...");
                startBot();
            }
        }
    });

    sock.ev.on("creds.update", saveState);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        const msg = messages[0];

        if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const metadata = await sock.groupMetadata(from);
        const isAdmin = metadata.participants.find(p => p.id === sender)?.admin;

        const reply = (text) =>
            sock.sendMessage(from, { text }, { quoted: msg });

        // !qr — Mostrar el QR manualmente
        if (body === "!qr" && isAdmin) {
            if (currentQR) {
                qrcode.generate(currentQR, { small: true });
                reply("📷 QR generado en la consola.");
            } else {
                reply("✅ Ya estás conectado o aún no hay QR disponible.");
            }
        }

        if (body === "!cerrar" && isAdmin) {
            await sock.groupSettingUpdate(from, "announcement");
            reply("✅ Grupo cerrado solo para administradores.");
        }

        if (body.startsWith("kick") && isAdmin) {
            const mentionedJid =
                msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

            if (!mentionedJid) {
                await sock.sendMessage(from, {
                    text: "Debes mencionar al usuario que deseas expulsar.",
                });
                return;
            }

            try {
                await sock.groupParticipantsUpdate(from, [mentionedJid], "remove");
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

        if (body === "!abrir" && isAdmin) {
            await sock.groupSettingUpdate(from, "not_announcement");
            reply("✅ Grupo abierto para todos los miembros.");
        }

        if (body === "!todos" && isAdmin) {
            const waveEmoji = "🩸";
            const bloodEmoji = "🩸";
            const titulo = `${bloodEmoji} : *_LPZ SCRIMS_*`;
            const separador = "━━━━━━━━━━━━━━";
            const etiquetas = metadata.participants.map((p) => {
                const nombre = p?.notify || p?.name || "";
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

        if (body === "!info" && isAdmin) {
            reply(`📌 Nombre: ${metadata.subject}\n👥 Participantes: ${metadata.participants.length}`);
        }

        if (body.startsWith("!ban") && isAdmin) {
            const mentioned =
                msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

            if (!mentioned || mentioned.length === 0) {
                reply("❌ Debes mencionar al usuario que deseas expulsar.");
                return;
            }

            const target = mentioned[0];
            const targetInfo = metadata.participants.find((p) => p.id === target);

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

        if (body === "!link" && isAdmin) {
            const code = await sock.groupInviteCode(from);
            reply(`🔗 Enlace del grupo: https://chat.whatsapp.com/${code}`);
        }

        if (body.startsWith(".n ") && isAdmin) {
            const text = body.slice(3).trim();
            const mentions = metadata.participants.map((p) => p.id);

            await sock.sendMessage(
                from,
                {
                    text: `📢 ${text}`,
                    mentions: mentions,
                },
                { quoted: msg }
            );

            await sock.sendMessage(from, {
                delete: msg.key,
            });
        }

        if (body === "!adminson") {
            const admins = metadata.participants.filter((p) => p.admin);
            const list = admins.map((a) => `@${a.id.split("@")[0]}`).join("\n");
            await sock.sendMessage(from, {
                text: `🛡️ Admins:\n${list}`,
                mentions: admins.map((a) => a.id),
            });
        }
    });
}

const http = require("http");
http.createServer((req, res) => res.end("Bot activo")).listen(3000);

startBot();
