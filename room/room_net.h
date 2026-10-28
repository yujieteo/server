/* The C side of room.goose: the socket on 127.0.0.1 and the OpenBSD sandbox.
   Each connection has a time limit of 5 s on each read and each write, so
   that a slow connection cannot hold the daemon. A Goose bool is a uint8_t
   in C. */
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

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
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
    }
    return (int32_t)fd;
}

/* Appends at most max bytes that came in to out. The count, 0 at the end
   of the input, or -1 on an error or at the time limit. */
int64_t room_recv(int32_t fd, int64_t max, gs_rref out) {
    uint8_t buf[16384];
    size_t want = max < (int64_t)sizeof buf ? (size_t)max : sizeof buf;
    for (;;) {
        ssize_t got = recv(fd, buf, want, 0);
        if (got < 0 && errno == EINTR) continue;
        if (got > 0) gs_bld_append(out, buf, (int64_t)got);
        return (int64_t)got;
    }
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
