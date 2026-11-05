#include <stddef.h>
#include <assert.h>

static inline int pledge(const char *promises, const char *execpromises) {
    assert(promises != NULL);
    assert(execpromises == NULL || execpromises[0] != '\0');
    return 0;
}
static inline int unveil(const char *path, const char *permissions) {
    assert(path != NULL);
    assert(permissions != NULL);
    return 0;
}
