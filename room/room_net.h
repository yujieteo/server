/* The C side of room.goose: the socket on 127.0.0.1, the client addresses
   and the OpenBSD sandbox. Each connection has a time limit of 2 s for all
   of its request and 5 s on each write, so that a slow connection cannot
   hold the daemon. A Goose bool is a uint8_t in C. */
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

/* The time at which the request of the connection must be in: 2 s after
   the accept. */
static struct timespec room_deadline;

static int64_t room_ms(const struct timespec *t) {
    return (int64_t)t->tv_sec * 1000 + t->tv_nsec / 1000000;
}

/* A write to a closed connection gives EPIPE, not a signal that kills the
   process. */
void room_no_sigpipe(void) {
    signal(SIGPIPE, SIG_IGN);
}

/* A listening socket on 127.0.0.1 and port, or -1. */
int32_t room_listen(int32_t port) {
    struct sockaddr_in a;
    memset(&a, 0, sizeof a);
    a.sin_family = AF_INET;
    a.sin_port = htons((uint16_t)port);
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    int on = 1;
    if (fd >= 0 && (setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on) != 0
                    || bind(fd, (struct sockaddr *)&a, sizeof a) != 0 || listen(fd, 128) != 0)) {
        close(fd);
        fd = -1;
    }
    return (int32_t)fd;
}

/* The next connection, or -1. */
int32_t room_accept(int32_t listener) {
    int fd = accept(listener, NULL, NULL);
    if (fd >= 0) {
        struct timeval tv = {5, 0};
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
        clock_gettime(CLOCK_MONOTONIC, &room_deadline);
        room_deadline.tv_sec += 2;
    }
    return (int32_t)fd;
}

/* Appends at most max bytes that came in to out. The count, 0 at the end
   of the input, or -1 on an error or at the time limit of the request. */
int64_t room_recv(int32_t fd, int64_t max, gs_rref out) {
    uint8_t buf[16384];
    size_t want = max < (int64_t)sizeof buf ? (size_t)max : sizeof buf;
    for (;;) {
        struct timespec now;
        clock_gettime(CLOCK_MONOTONIC, &now);
        int64_t left = room_ms(&room_deadline) - room_ms(&now);
        if (left <= 0) return -1;
        struct pollfd p = {fd, POLLIN, 0};
        int ready = poll(&p, 1, (int)left);
        if (ready < 0 && errno == EINTR) continue;
        if (ready <= 0) return -1;
        ssize_t got = recv(fd, buf, want, 0);
        if (got < 0 && errno == EINTR) continue;
        if (got > 0) gs_bld_append(out, buf, (int64_t)got);
        return (int64_t)got;
    }
}

/* The key of a client address for the limits: an IPv6 address as its /64,
   because one host often has all of a /64, and else the address. */
void room_client_key(sl_u8 ip, gs_rref out) {
    char text[INET6_ADDRSTRLEN];
    struct in6_addr a;
    if (ip.len < (int64_t)sizeof text) {
        memcpy(text, ip.data, (size_t)ip.len);
        text[ip.len] = 0;
        if (inet_pton(AF_INET6, text, &a) == 1) {
            memset(&a.s6_addr[8], 0, 8);
            inet_ntop(AF_INET6, &a, text, sizeof text);
            gs_bld_append(out, (const uint8_t *)text, (int64_t)strlen(text));
            return;
        }
    }
    gs_bld_append(out, ip.data, ip.len);
}

/* Sends all of data. */
uint8_t room_send(int32_t fd, sl_u8 data) {
    const uint8_t *p = data.data;
    int64_t n = data.len;
    while (n > 0) {
        ssize_t w = send(fd, p, (size_t)n, 0);
        if (w < 0 && errno == EINTR) continue;
        if (w <= 0) return 0;
        p += w;
        n -= w;
    }
    return 1;
}

void room_close(int32_t fd) {
    if (fd >= 0) close(fd);
}

/* After the listening socket is open, the daemon can only take connections:
   with no rpath, wpath or cpath, it cannot open a file. On other systems this
   does nothing. */
uint8_t room_sandbox(void) {
#ifdef __OpenBSD__
    return pledge("stdio inet", NULL) == 0;
#else
    return 1;
#endif
}
