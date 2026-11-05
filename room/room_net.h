#include <arpa/inet.h>
#include <assert.h>
#include <errno.h>
#include <netinet/in.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#define ROOM_REQUEST_LIMIT_S 2
#define ROOM_WRITE_LIMIT_S 5
#define ROOM_LISTEN_BACKLOG 128
#define ROOM_IPV6_KEEP_BYTES 8
#define ROOM_RECV_TRIES 1024

static struct timespec room_deadline;

static int64_t room_ms(const struct timespec *t) {
    assert(t != NULL);
    assert(t->tv_nsec >= 0 && t->tv_nsec < 1000000000L);
    return (int64_t)t->tv_sec * 1000 + t->tv_nsec / 1000000;
}

void room_no_sigpipe(void) {
    sig_t previous = signal(SIGPIPE, SIG_IGN);
    assert(previous != SIG_ERR);
    assert(signal(SIGPIPE, SIG_IGN) == SIG_IGN);
}

int32_t room_listen(int32_t port) {
    assert(port >= 0 && port <= 65535);
    struct sockaddr_in a;
    memset(&a, 0, sizeof a);
    a.sin_family = AF_INET;
    a.sin_port = htons((uint16_t)port);
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    int on = 1;
    if (fd >= 0 && (setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on) != 0
                    || bind(fd, (struct sockaddr *)&a, sizeof a) != 0 || listen(fd, ROOM_LISTEN_BACKLOG) != 0)) {
        close(fd);
        fd = -1;
    }
    assert(fd >= -1);
    assert(a.sin_family == AF_INET);
    return (int32_t)fd;
}

int32_t room_accept(int32_t listener) {
    assert(listener >= 0);
    int fd = accept(listener, NULL, NULL);
    if (fd >= 0) {
        struct timeval tv = {ROOM_WRITE_LIMIT_S, 0};
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
        clock_gettime(CLOCK_MONOTONIC, &room_deadline);
        room_deadline.tv_sec += ROOM_REQUEST_LIMIT_S;
    }
    assert(fd >= -1);
    return (int32_t)fd;
}

int64_t room_recv(int32_t fd, int64_t max, gs_rref out) {
    uint8_t buf[16384];
    assert(fd >= 0);
    assert(max >= 0);
    size_t want = max < (int64_t)sizeof buf ? (size_t)max : sizeof buf;
    for (int tries = 0; tries < ROOM_RECV_TRIES; tries++) {
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
        assert(got <= (ssize_t)want);
        return (int64_t)got;
    }
    return -1;
}

void room_client_key(sl_u8 ip, gs_rref out) {
    char text[INET6_ADDRSTRLEN];
    struct in6_addr a;
    assert(ip.len >= 0);
    assert(ip.data != NULL || ip.len == 0);
    if (ip.len < (int64_t)sizeof text) {
        memcpy(text, ip.data, (size_t)ip.len);
        text[ip.len] = 0;
        if (inet_pton(AF_INET6, text, &a) == 1) {
            memset(&a.s6_addr[ROOM_IPV6_KEEP_BYTES], 0, 16 - ROOM_IPV6_KEEP_BYTES);
            inet_ntop(AF_INET6, &a, text, sizeof text);
            gs_bld_append(out, (const uint8_t *)text, (int64_t)strlen(text));
            return;
        }
    }
    gs_bld_append(out, ip.data, ip.len);
    assert(ip.len >= 0);
}

uint8_t room_send(int32_t fd, sl_u8 data) {
    const uint8_t *p = data.data;
    int64_t n = data.len;
    assert(fd >= 0);
    assert(n >= 0);
    while (n > 0) {
        ssize_t w = send(fd, p, (size_t)n, 0);
        if (w < 0 && errno == EINTR) continue;
        if (w <= 0) return 0;
        p += w;
        n -= w;
    }
    assert(n == 0);
    return 1;
}

void room_close(int32_t fd) {
    assert(fd >= -1);
    assert(fd < (1 << 20));
    if (fd >= 0) close(fd);
}

uint8_t room_sandbox(void) {
    assert(room_deadline.tv_sec >= 0);
    assert(room_ms(&room_deadline) >= 0);
#ifdef __OpenBSD__
    return pledge("stdio inet", NULL) == 0;
#else
    return 1;
#endif
}
