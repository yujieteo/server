/* The main of the pond save service: unveil and pledge, then the main of pond_save.c.
   pond_save.c, pond_verify.h and pond_lock.h are copies from the pond repo (README.md names
   the commit). Do not change them here. install.sh builds this file. */
#include <err.h>
#include <unistd.h>

#define main pond_save_main
#include "pond_save.c"
#undef main

int main(int argc, char **argv) {
	/* /pond is /var/www/pond in the slowcgi chroot. The program reads keys and writes entries. */
	if (unveil("/pond/keys", "r") == -1 || unveil("/pond/entries", "rwc") == -1)
		err(1, "unveil");
	if (pledge("stdio rpath wpath cpath flock", NULL) == -1)
		err(1, "pledge");
	return pond_save_main(argc, argv);
}
