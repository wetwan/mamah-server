import { onlineClients } from "../server.js";

export const sendMessageToUser = (userId, message) => {
  const clients = onlineClients.get(userId.toString()) || [];
  let sent = false;

  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
      sent = true;
    }
  }
  return sent;
};
