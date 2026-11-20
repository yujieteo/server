#!/usr/bin/perl
# Offline: prove tests/sg-reach-freshness.t
use strict;
use warnings;
use File::Copy qw(copy);
use File::Path qw(make_path);
use File::Temp qw(tempdir);
use FindBin;
use Test::More;
use Time::Local qw(timegm);

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

my $tmp = tempdir(CLEANUP => 1);
my $out = "$tmp/out";
make_path("$tmp/OpenBSD", $out);
write_file("$tmp/OpenBSD/Pledge.pm", 'package OpenBSD::Pledge; sub import { *main::pledge = sub { 1 } } 1;');
write_file("$tmp/OpenBSD/Unveil.pm", 'package OpenBSD::Unveil; sub import { *main::unveil = sub { 1 } } 1;');
copy("$FindBin::Bin/../sbin/feed-common.pl", "$tmp/feed-common.pl") or die $!;
my $job = "$FindBin::Bin/../sbin/sg-update";
my $driver = "$tmp/driver.pl";
my $notes = "$tmp/notes.tsv";
write_file($notes, '');
write_file($driver, <<'DRIVER');
use strict;
use warnings;
use FindBin;
BEGIN { *CORE::GLOBAL::sleep = sub { 0 } }
require "$FindBin::Bin/feed-common.pl";
my $job = shift @ARGV;
my $real_publish = \&publish;
my $open = '<item><title>Fixture open</title><link>https://example.invalid/open</link><pubDate>Wed, 11 Nov 2026</pubDate><category>Open</category></item>';
my $closed = '<item><title>Fixture closed</title><link>https://example.invalid/closed</link><pubDate>Sun, 29 Nov 2026</pubDate><category>Closed</category></item>';
my $other = '<item><title>Fixture notice</title><link>https://example.invalid/notice</link><pubDate>Sun, 29 Nov 2026</pubDate></item>';
{
	no warnings qw(redefine once);
	*fetch_url = sub {
		die 'unexpected fetch in render-only mode' if $ENV{FIXTURE_RENDER};
		return "<rss>$other</rss>" unless $_[0] =~ m{www\.reach\.gov\.sg/};
		return '' unless $ENV{FIXTURE_REACH};
		return "<rss>$open$closed</rss>";
	};
	*publish = sub {
		$real_publish->(@_);
		if ($_[0] =~ m{/sg-cache/}) {
			utime $ENV{FIXTURE_TIME}, $ENV{FIXTURE_TIME}, $_[0] or die $!;
		}
	};
}
my $result = do $job;
die $@ if $@;
die $! unless defined $result;
DRIVER

sub run_job {
	my ($time, $reach, $render) = @_;
	local $ENV{FIXTURE_TIME} = $time;
	local $ENV{FIXTURE_REACH} = $reach;
	local $ENV{FIXTURE_RENDER} = $render;
	my @flags = $render ? ('--render') : ();
	is(system($^X, "-I$tmp", $driver, $job, @flags, $out, $notes), 0, 'job succeeds');
}
sub output {
	my ($ext) = @_;
	return read_file("$out/singapore-policy-actionables.$ext");
}
sub check_reach_date {
	my ($date, $phase) = @_;
	for my $ext (qw(html xml)) {
		like(output($ext), qr/Marked open in REACH snapshot \(as of \Q$date\E\)/, "$phase: $ext open label");
		like(output($ext), qr/Not marked open in REACH snapshot \(as of \Q$date\E\)/, "$phase: $ext non-open label");
		like(output($ext), qr/Check the REACH page for the deadline/, "$phase: $ext deadline link guidance");
	}
	like(output('txt'), qr/^# REACH kind reflects its saved snapshot \(as of \Q$date\E\), not current status\./m, "$phase: text freshness metadata");
}
my $first = timegm(0, 10, 17, 4, 11, 2026); # Dec 5 in Singapore.
my $second = timegm(0, 10, 0, 12, 11, 2026);
run_job($first, 1, 0);
check_reach_date('2026-12-05 SGT', 'fresh fetch');
my @before = grep { /\tREACH\t/ } split /\n/, output('txt');
is(scalar @before, 2, 'two REACH text rows');
is(scalar(split /\t/, $before[0]), 9, 'text fields unchanged');

run_job($second, 0, 0);
check_reach_date('2026-12-05 SGT', 'failed REACH refresh');
like(output('xml'), qr/<lastBuildDate>Sat, 12 Dec 2026/, 'overall build stamp advanced');
my ($open_before) = grep { /\tconsultation\t/ } @before;
my ($open_after) = grep { /\tREACH\tconsultation\t/ } split /\n/, output('txt');
is($open_after, $open_before, 'open ranking and text row unchanged on fallback');

my $txt = "$out/singapore-policy-actionables.txt";
utime 0, 0, $txt or die $!;
run_job($second, 0, 1);
check_reach_date('2026-12-05 SGT', 'render-only');
is((stat "$out/sg-cache/reach")[9], $first, 'render preserves REACH cache date');
utime 0, 0, "$out/sg-cache/reach", $txt or die $!;
run_job($second, 0, 1);
check_reach_date('unknown', 'unknown cache timestamp');

done_testing;
