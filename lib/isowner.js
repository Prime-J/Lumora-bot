// lib/isOwner.js
function normalizeNumber(jid = "") {
  // "2637xxxx@s.whatsapp.net" -> "2637xxxx"
  return jid.split("@")[0].replace(/\D/g, "");
}

function isOwner(senderJid, settings) {
  const sender = normalizeNumber(senderJid);
  const owners = (settings?.ownerNumbers || []).map((n) => String(n).replace(/\D/g, ""));
  return owners.includes(sender);
}

module.exports = { isOwner, normalizeNumber };