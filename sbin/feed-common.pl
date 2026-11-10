use strict;
use warnings;

# Shared by feed-update, edmw-update and sg-update. Each loads it from its own folder.

(my $job = $0) =~ s{.*/}{};

sub character {
	my ($code) = @_;
	return '' if $code < 0x20 || $code > 0x10FFFF || ($code >= 0xD800 && $code <= 0xDFFF);
	my $text = chr $code;
	utf8::encode($text);
	return $text;
}

# Turns HTML entities into the characters they name.
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
	return $text;
}

sub escaped {
	my ($text) = @_;
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

sub publish {
	my ($path, $content) = @_;
	my $temporary = "$path.new";
	open my $file, '>', $temporary or die "$job: $temporary: $!\n";
	print {$file} $content or die "$job: write: $!\n";
	close $file or die "$job: close: $!\n";
	chmod 0644, $temporary or die "$job: chmod: $!\n";
	rename $temporary, $path or die "$job: rename: $!\n";
}

# httpd ignores a .gz older than its original, so a failure here only means no compression.
sub publish_gzipped {
	my ($path, $content) = @_;
	publish($path, $content);
	system("gzip -9nc <\Q$path\E >\Q$path\E.gz.new") == 0 or die "$job: gzip $path failed\n";
	chmod 0644, "$path.gz.new" or die "$job: chmod: $!\n";
	rename "$path.gz.new", "$path.gz" or die "$job: rename: $!\n";
}

sub fetch_url {
	my ($url, $wait) = @_;
	my $text = qx{ftp -MV -w $wait -U teoyujie-feed/1.0 -o - '$url' 2>/dev/null};
	return $? == 0 ? $text : '';
}

# Reads notes that agents wrote, from a file the site deploy brings. One line
# per note: id, tab, points, tab, text. Later cells are for the site build.
# The site build checks the file, so this only has to be safe with a bad one.
my $note_points_limit = 60;

sub read_notes {
	my ($path) = @_;
	my %notes;
	open my $file, '<', $path or return \%notes;
	while (my $line = <$file>) {
		chomp $line;
		my ($id, $points, $text) = split /\t/, $line;
		next unless defined $points && $id =~ /^[0-9a-f]{8}$/ && $points =~ /^[+-]?\d{1,3}$/;
		$points = $note_points_limit if $points > $note_points_limit;
		$points = -$note_points_limit if $points < -$note_points_limit;
		$text //= '';
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
	for my $path (glob "\Q$folder\E/*") {
		(my $name = $path) =~ s{.*/}{};
		unlink $path if -f $path && !$kept{$name};
	}
}

1;
