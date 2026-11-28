#!/usr/bin/perl
# Offline: prove tests/feed-arxiv-revisions.t
# Runs feed-update twice: the arXiv feed first sends version 1 of each paper, then a later version.
use strict;
use warnings;
use File::Copy qw(copy);
use File::Path qw(make_path);
use File::Temp qw(tempdir);
use FindBin;
use Test::More;
use lib "$FindBin::Bin/lib";
use TestFiles;

my $tmp = tempdir(CLEANUP => 1);
my $out = "$tmp/out";
make_path($out);
copy("$FindBin::Bin/../sbin/feed-common.pl", "$tmp/feed-common.pl") or die $!;
my $job = "$FindBin::Bin/../sbin/feed-update";
my $driver = "$tmp/driver.pl";
my $bets = "$tmp/bets.txt";
write_file($bets, "id\tmade\n");

# 3786d33e is the id the old code gave version 1 of 2102.13459 (from the issue). The note there was saved
# before the change. e53d971d is the new id of math.AG/0601001, so its note was saved after the change.
my $notes = "$tmp/notes.tsv";
write_file($notes, "3786d33e\t2\tKept across revisions.\ne53d971d\t3\tOld-style id note.\n");

write_file($driver, <<'DRIVER');
use strict;
use warnings;
use FindBin;
BEGIN { *CORE::GLOBAL::sleep = sub { 0 } }
require "$FindBin::Bin/feed-common.pl";
my $job = shift @ARGV;
my $v = $ENV{FIXTURE_SNAPSHOT} == 1 ? 1 : 4;
my $w = $ENV{FIXTURE_SNAPSHOT} == 1 ? 1 : 2;
sub entry {
	my ($link, $date, $title) = @_;
	return qq{<entry><id>$link</id><published>$date</published><updated>$date</updated><title>$title</title><summary>Abstract.</summary>}
		. qq{<link href="$link" rel="alternate" type="text/html"/><link title="pdf" href="$link.pdf" rel="related" type="application/pdf"/></entry>};
}
sub item {
	my ($link, $date, $title) = @_;
	return "<item><title>$title</title><link>$link</link><pubDate>$date</pubDate><description>Text.</description></item>";
}
my $atom = '<feed xmlns="http://www.w3.org/2005/Atom">'
	. entry("http://arxiv.org/abs/2102.13459v$v", '2026-11-01T00:00:00Z', 'Noted modern paper')
	. entry("http://arxiv.org/abs/2603.01234v$w", '2026-11-01T01:00:00Z', 'Newer paper with no note')
	. entry("http://arxiv.org/abs/math.AG/0601001v$w", '2026-10-31T00:00:00Z', 'Noted old-style paper')
	. '</feed>';
my %rss = (
	'terrytao' => item('https://terrytao.wordpress.com/2026/11/01/a-note-v2/', 'Sun, 01 Nov 2026 02:00:00 +0000', 'A blog post'),
	'columbia' => item('https://arxiv.org/list/math.NT/new', 'Sun, 01 Nov 2026 03:00:00 +0000', 'Not an abstract page')
		. item('https://notarxiv.org/abs/2102.13459v2', 'Sun, 01 Nov 2026 04:00:00 +0000', 'Another host'),
	'hnrss' => item('https://example.invalid/hn/comment-1', 'Sun, 01 Nov 2026 05:00:00 +0000', 'A comment'),
	'stallman' => item('https://stallman.org/archives/2026-sep-dec.html#1_November_2026_(x)', 'Sun, 01 Nov 2026 06:00:00 +0000', 'A note'),
);
{
	no warnings qw(redefine once);
	*fetch_url = sub {
		my ($url) = @_;
		return $atom if $url =~ m{^https://export\.arxiv\.org/};
		for my $host (keys %rss) {
			return "<rss><channel>$rss{$host}</channel></rss>" if index($url, $host) >= 0;
		}
		return '';
	};
}
my $result = do $job;
die $@ if $@;
die $! unless defined $result;
DRIVER

sub run_job {
	my ($snapshot) = @_;
	local $ENV{FIXTURE_SNAPSHOT} = $snapshot;
	is(system($^X, "-I$FindBin::Bin/lib", $driver, $job, "$out/feed.xml", $notes, $bets), 0, "snapshot $snapshot: job succeeds");
	my @order = map { (split /\t/)[0] } grep { !/^#/ } split /\n/, read_file("$out/reading.txt");
	return (read_file("$out/feed.xml"), read_file("$out/reading.html"), \@order, read_file("$out/reading.txt"));
}

sub rss_item {
	my ($xml, $link) = @_;
	my ($item) = $xml =~ m{(<item><title>[^<]*</title><link>\Q$link\E</link>.*?</item>)};
	return $item // '';
}

sub position {
	my ($order, $id) = @_;
	my ($at) = grep { $order->[$_] eq $id } 0 .. $#$order;
	return $at;
}

my %before;
@before{qw(xml html order txt)} = run_job(1);
my %after;
@after{qw(xml html order txt)} = run_job(2);

my @arxiv = (
	['2102.13459', '645e455d', 'http://arxiv.org/abs/2102.13459v1', 'http://arxiv.org/abs/2102.13459v4'],
	['math.AG/0601001', 'e53d971d', 'http://arxiv.org/abs/math.AG/0601001v1', 'http://arxiv.org/abs/math.AG/0601001v2'],
	['2603.01234', '5f5bc75d', 'http://arxiv.org/abs/2603.01234v1', 'http://arxiv.org/abs/2603.01234v2'],
);
for my $paper (@arxiv) {
	my ($name, $id, $old, $new) = @$paper;
	for my $run (['v1', \%before, $old], ['later', \%after, $new]) {
		my ($phase, $got, $link) = @$run;
		like($got->{txt}, qr/^\Q$id\E\t[^\n]*\t\Q$link\E$/m, "$name $phase: stable id, link to this revision");
		like(rss_item($got->{xml}, $link), qr{<guid isPermaLink="false">https://arxiv\.org/abs/\Q$name\E</guid>}, "$name $phase: version-free RSS GUID");
		is(scalar(grep { $_ eq $id } @{$got->{order}}), 1, "$name $phase: one row per paper");
	}
}

for my $run (['v1', \%before], ['later', \%after]) {
	my ($phase, $got) = @$run;
	like($got->{html}, qr{<h3>Noted modern paper</h3>.*<p>Kept across revisions\. · arXiv</p>}, "$phase: note saved under the old v1 id still attaches");
	like($got->{html}, qr{<h3>Noted old-style paper</h3>.*<p>Old-style id note\. · arXiv</p>}, "$phase: note under the new id attaches");
	# The noted paper is an hour older than the paper with no note, so only its two points put it first.
	cmp_ok(position($got->{order}, '645e455d'), '<', position($got->{order}, '5f5bc75d'), "$phase: note points still move the item");
}

# The ids and GUIDs of other items are what the old code gave them, so RSS readers do not see them as new.
my @other = (
	['154de462', 'https://terrytao.wordpress.com/2026/11/01/a-note-v2/'],
	['0b8618ff', 'https://arxiv.org/list/math.NT/new'],
	['e76c073a', 'https://notarxiv.org/abs/2102.13459v2'],
	['48dd9033', 'https://example.invalid/hn/comment-1'],
);
for my $item (@other) {
	my ($id, $link) = @$item;
	for my $run (['v1', \%before], ['later', \%after]) {
		my ($phase, $got) = @$run;
		like($got->{txt}, qr/^\Q$id\E\t[^\n]*\t\Q$link\E$/m, "$link $phase: id unchanged");
		like(rss_item($got->{xml}, $link), qr{<guid isPermaLink="true">\Q$link\E</guid>}, "$link $phase: GUID is still the link");
	}
}

done_testing;
