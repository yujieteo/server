#include <assert.h>
#include <err.h>
#include <unistd.h>

#define POND_KEYS_IN_SLOWCGI_CHROOT "/pond/keys"
#define POND_ENTRIES_IN_SLOWCGI_CHROOT "/pond/entries"

#define main pond_save_main
#include "pond_save.c"
#undef main

int main(void) {
	int keys = unveil(POND_KEYS_IN_SLOWCGI_CHROOT, "r");
	assert(keys == 0 || keys == -1);
	if (keys == -1)
		err(1, "unveil");
	int entries = unveil(POND_ENTRIES_IN_SLOWCGI_CHROOT, "rwc");
	assert(entries == 0 || entries == -1);
	if (entries == -1)
		err(1, "unveil");
	int promised = pledge("stdio rpath wpath cpath flock", NULL);
	assert(promised == 0 || promised == -1);
	if (promised == -1)
		err(1, "pledge");
	return pond_save_main(0, NULL);
}
