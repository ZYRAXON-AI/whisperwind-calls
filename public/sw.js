/* Zyraxon Service Worker — PWA + call notifications */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

/* Push notification for incoming calls */
self.addEventListener("push", (e) => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || "Incoming Call", {
      body: data.body || "Someone is calling you",
      icon: "/icon.svg",
      badge: "/icon.svg",
      vibrate: [200, 100, 200, 100, 200],
      tag: "zyraxon-call",
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: "accept", title: "Accept" },
        { action: "reject", title: "Reject" },
      ],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const action = e.action;
  if (action === "accept" || action === "reject") {
    e.waitUntil(
      clients.matchAll({ type: "window" }).then((w) => {
        for (const win of w) {
          if (win.url.includes("/")) {
            win.postMessage({ type: "call-action", action });
            return win.focus();
          }
        }
        return clients.openWindow("/");
      })
    );
  } else {
    e.waitUntil(clients.openWindow("/"));
  }
});
