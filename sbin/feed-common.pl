use strict;
use warnings;
use OpenBSD::Pledge;
use OpenBSD::Unveil;

# Shared by feed-update, edmw-update and sg-update. Each loads it from its own folder.

(my $job = $0) =~ s{.*/}{};
umask 022;
open my $null, '>', '/dev/null' or die "$job: /dev/null: $!\n";

# A job reads text from outside, so it gets the least it needs: its own folder,
# and ftp to fetch with. The promises come from ktrace runs of the three jobs.
sub confine {
	my ($folder) = @_;
	unveil($folder, 'rwc') && unveil('/usr/bin/ftp', 'x') && unveil() or die "$job: unveil: $!\n";
	pledge(qw(rpath wpath cpath proc exec)) or die "$job: pledge: $!\n";
}

# Called after the last fetch and before any parsing: from here the job can run no program.
sub fetched {
	pledge(qw(rpath wpath cpath)) or die "$job: pledge: $!\n";
}

sub slurp {
	my ($path) = @_;
	open my $file, '<', $path or return '';
	local $/;
	return scalar <$file> // '';
}

sub character {
	my ($code) = @_;
	return '' if $code < 0x20 || $code > 0x10FFFF || ($code >= 0xD800 && $code <= 0xDFFF);
	my $text = chr $code;
	utf8::encode($text);
	return $text;
}

# Keeps what is valid UTF-8 and allowed in XML: no stray bytes, control characters, surrogates or
# non-characters. One such byte from one source would make a whole page unreadable for a feed reader.
my $valid = qr/[\x09\x0a\x0d\x20-\x7e]|[\xc2-\xdf][\x80-\xbf]|\xe0[\xa0-\xbf][\x80-\xbf]|[\xe1-\xec\xee][\x80-\xbf]{2}|\xed[\x80-\x9f][\x80-\xbf]|\xef[\x80-\xbe][\x80-\xbf]|\xef\xbf[\x80-\xbd]|\xf0[\x90-\xbf][\x80-\xbf]{2}|[\xf1-\xf3][\x80-\xbf]{3}|\xf4[\x80-\x8f][\x80-\xbf]{2}/;

sub valid {
	my ($text) = @_;
	return join '', $text =~ /$valid/g;
}

# Turns HTML entities into the characters they name. Every text from a source passes through here.
sub unescaped {
	my ($text) = @_;
	$text =~ s/&#(\d+);/character($1)/ge;
	$text =~ s/&#[xX]([0-9a-fA-F]+);/character(hex $1)/ge;
	$text =~ s/&lt;/</g;
	$text =~ s/&gt;/>/g;
	$text =~ s/&quot;/"/g;
	$text =~ s/&apos;/'/g;
	$text =~ s/&nbsp;/ /g;
	$text =~ s/&amp;/&/g;
	return valid($text);
}

# The last step before a page: whatever path a text took, the page stays well-formed.
sub escaped {
	my ($text) = @_;
	$text = valid($text);
	$text =~ s/&/&amp;/g;
	$text =~ s/</&lt;/g;
	$text =~ s/>/&gt;/g;
	$text =~ s/"/&quot;/g;
	return $text;
}

sub excerpt {
	my ($text, $length) = @_;
	my $characters = $text;
	return $text unless utf8::decode($characters) && length $characters > $length;
	$characters = substr $characters, 0, $length;
	$characters =~ s/\s+\S*$//;
	$characters .= "\x{2026}";
	utf8::encode($characters);
	return $characters;
}

# A title is one line of a page, however long its source makes it.
sub headline {
	my ($text) = @_;
	return excerpt($text, 300);
}

sub publish {
	my ($path, $content) = @_;
	my $temporary = "$path.new";
	open my $file, '>', $temporary or die "$job: $temporary: $!\n";
	print {$file} $content or die "$job: write: $!\n";
	close $file or die "$job: close: $!\n";
	rename $temporary, $path or die "$job: rename: $!\n";
}

# Runs ftp with no shell, so no part of an address can become a command.
sub fetch_url {
	my ($url, $wait) = @_;
	my $pid = open my $out, '-|';
	die "$job: fork: $!\n" unless defined $pid;
	if (!$pid) {
		open STDERR, '>&', $null;
		exec '/usr/bin/ftp', '-MV', '-w', $wait, '-U', 'teoyujie-feed/1.0', '-o', '-', $url;
		exit 127;
	}
	local $/;
	my $text = <$out>;
	close $out;
	return $? == 0 ? $text // '' : '';
}

# Reads notes that agents wrote, from the text of a file the site deploy brings.
# One line per note: id, tab, points, tab, text. Later cells are for the site build.
# The site build checks the file, so this only has to be safe with a bad one.
my $note_points_limit = 60;

sub read_notes {
	my ($notes_text) = @_;
	my %notes;
	for my $line (split /\n/, $notes_text) {
		my ($id, $points, $text) = split /\t/, $line;
		next unless defined $points && $id =~ /^[0-9a-f]{8}$/ && $points =~ /^[+-]?\d{1,3}$/;
		$points = $note_points_limit if $points > $note_points_limit;
		$points = -$note_points_limit if $points < -$note_points_limit;
		$text = valid($text // '');
		$text =~ s/<[^>]*>//g;
		$text =~ s/[\x00-\x1f]/ /g;
		$text =~ s/\s+/ /g;
		$text =~ s/^ | $//g;
		$notes{$id} = { points => $points + 0, text => $text };
	}
	return \%notes;
}

# Deletes the saved copies of sources that have left the list, so health-check does not report them as stale.
sub prune {
	my ($folder, %kept) = @_;
	opendir my $handle, $folder or return;
	for my $name (readdir $handle) {
		unlink "$folder/$name" if -f "$folder/$name" && !$kept{$name};
	}
}

1;
