# A stand-in for OpenBSD::Unveil, which exists only in the perl of OpenBSD base.
# It exports the same name and does nothing, so the feed code runs off OpenBSD.
package OpenBSD::Unveil;
use strict;
use warnings;
use Exporter qw(import);
our @EXPORT = qw(unveil);
sub unveil { 1 }
1;
