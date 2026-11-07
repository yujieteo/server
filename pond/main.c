#include <err.h>
#include <unistd.h>

#define POND_KEYS_IN_SLOWCGI_CHROOT "/pond/keys"
#define POND_ENTRIES_IN_SLOWCGI_CHROOT "/pond/entries"

#define main pond_save_main
#include "pond_save.c"
#undef main

int main(int argc, char **argv) {
	if (unveil(POND_KEYS_IN_SLOWCGI_CHROOT, "r") == -1 || unveil(POND_ENTRIES_IN_SLOWCGI_CHROOT, "rwc") == -1)
		err(1, "unveil");
	if (pledge("stdio rpath wpath cpath flock", NULL) == -1)
		err(1, "pledge");
	return pond_save_main(argc, argv);
}
