# File helpers shared by the offline tests in tests/*.t.
package TestFiles;
use strict;
use warnings;
use Exporter qw(import);
our @EXPORT = qw(write_file read_file);

sub write_file {
	my ($path, $content) = @_;
	open my $fh, '>', $path or die "$path: $!";
	print {$fh} $content or die "$path: $!";
	close $fh or die "$path: $!";
}

sub read_file {
	my ($path) = @_;
	open my $fh, '<', $path or die "$path: $!";
	local $/;
	return scalar <$fh>;
}

1;
