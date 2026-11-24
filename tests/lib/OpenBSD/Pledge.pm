# A stand-in for OpenBSD::Pledge, which exists only in the perl of OpenBSD base.
# It exports the same name and does nothing, so the feed code runs off OpenBSD.
package OpenBSD::Pledge;
use strict;
use warnings;
use Exporter qw(import);
our @EXPORT = qw(pledge);
sub pledge { 1 }
1;
