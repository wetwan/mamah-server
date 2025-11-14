import { onlineClients } from "../server.js";

export const sendMessageToUser = async (userId, message) => {
  const clients = onlineClients.get(userId.toString()) || [];
  let sent = false;
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
      sent = true;
    }
  });
  return sent;
};
