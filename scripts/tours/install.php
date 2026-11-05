<?php
/**
 * Install, check or remove guided tours from a tours.json file, straight in the Joomla database.
 * Joomla has no Web Services route for com_guidedtours, so tours.mjs copies this file to the
 * server and runs it from the Joomla root over SSH.
 *
 *   php install.php tours.json             (re)install every tour in the file
 *   php install.php tours.json --dry-run   do everything inside a transaction and roll it back
 *   php install.php tours.json --remove    remove the tours of this prefix
 *
 * Only tours whose uid starts with the "prefix" of the file are touched, so core tours and tours
 * made by others stay as they are. Reinstalling deletes and recreates them (new ids).
 */

if (!is_file('configuration.php')) {
    fwrite(STDERR, "Run this from the Joomla root (configuration.php not found).\n");
    exit(1);
}
require 'configuration.php';
$c = new JConfig();
if (!in_array($c->dbtype ?? 'mysqli', ['mysql', 'mysqli'], true)) {
    fwrite(STDERR, "Only MySQL and MariaDB sites are supported (this site uses {$c->dbtype}).\n");
    exit(1);
}
// Joomla allows "host:port" and "host:/path/to/socket" in the database host
$host = $c->host;
$port = null;
$socket = null;
if (preg_match('/^(.+):(\d+)$/', $host, $m)) {
    [, $host, $port] = $m;
    $port = (int) $port;
} elseif (preg_match('/^(.+):(\/.+)$/', $host, $m)) {
    [, $host, $socket] = $m;
}
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db = new mysqli($host, $c->user, $c->password, $c->db, $port, $socket);
$db->set_charset('utf8mb4');
$p = $c->dbprefix;

$data   = json_decode(file_get_contents($argv[1] ?? ''), true, 512, JSON_THROW_ON_ERROR);
$remove = in_array('--remove', $argv, true);
$dry    = in_array('--dry-run', $argv, true);
$prefix = $data['prefix'] ?? '';
if (!preg_match('/^[a-z0-9][a-z0-9-]*-$/', $prefix)) {
    fwrite(STDERR, "tours.json needs a \"prefix\" such as \"mysite-\" (lower case, ending in a dash).\n");
    exit(1);
}
$by  = (int) ($data['createdBy'] ?? 0);
$now = gmdate('Y-m-d H:i:s');

$types  = ['next' => 0, 'redirect' => 1, 'interactive' => 2];
$itypes = ['submit' => 1, 'text' => 2, 'other' => 3, 'button' => 4, 'checkbox_radio' => 5, 'select' => 6];
$num = static fn ($v, array $map, string $what) => is_int($v) ? $v
    : ($map[$v] ?? throw new InvalidArgumentException("Unknown $what \"$v\""));

$db->begin_transaction();
$like = $db->real_escape_string($prefix) . '%';
$old  = $db->query("SELECT id, uid FROM {$p}guidedtours WHERE uid LIKE '$like'")->fetch_all(MYSQLI_ASSOC);
foreach ($old as $row) {
    $db->query("DELETE FROM {$p}guidedtour_steps WHERE tour_id=" . (int) $row['id']);
    $db->query("DELETE FROM {$p}guidedtours WHERE id=" . (int) $row['id']);
}
echo 'Removed ', count($old), " tour(s) with prefix $prefix\n";

if (!$remove) {
    $t = $db->prepare("INSERT INTO {$p}guidedtours
        (title, uid, description, ordering, extensions, url, created, created_by, modified, modified_by,
         published, language, note, access, autostart)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,?,'',?,?)");
    $s = $db->prepare("INSERT INTO {$p}guidedtour_steps
        (tour_id, title, published, description, ordering, position, target, type, interactive_type, url,
         created, created_by, modified, modified_by, language, note, params)
        VALUES (?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'',?)");
    foreach ($data['tours'] as $tour) {
        if (!str_starts_with($tour['uid'], $prefix)) {
            throw new InvalidArgumentException("uid {$tour['uid']} does not start with $prefix");
        }
        $ext   = json_encode($tour['extensions']);
        $desc  = $tour['description'] ?? '';
        $lang  = $tour['language'] ?? '*';
        $acc   = (int) ($tour['access'] ?? 1);
        $auto  = (int) ($tour['autostart'] ?? 0);
        $ord   = (int) ($tour['ordering'] ?? 0);
        $t->bind_param('sssisssisisii', $tour['title'], $tour['uid'], $desc, $ord, $ext,
            $tour['url'], $now, $by, $now, $by, $lang, $acc, $auto);
        $t->execute();
        $tid = $db->insert_id;
        foreach ($tour['steps'] as $i => $st) {
            $o      = $i + 1;
            $type   = $num($st['type'] ?? 'next', $types, 'type');
            $itype  = $num($st['interactive_type'] ?? 'submit', $itypes, 'interactive_type');
            $target = $st['target'] ?? '';
            $pos    = $st['position'] ?? ($target === '' ? 'center' : 'bottom');
            $url    = $st['url'] ?? $tour['url'];
            $params = isset($st['params']) ? json_encode($st['params']) : null;
            $s->bind_param('ississiissisiss', $tid, $st['title'], $st['description'], $o, $pos, $target,
                $type, $itype, $url, $now, $by, $now, $by, $lang, $params);
            $s->execute();
        }
        echo "Tour $tid {$tour['uid']}: ", count($tour['steps']), " steps\n";
    }
}

if ($dry) {
    $db->rollback();
    echo "Dry run: rolled back, nothing changed.\n";
} else {
    $db->commit();
}
