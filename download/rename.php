<?php
$old = '/home4/marci955/public_html/mastering/index.html.cache';
$new = '/home4/marci955/public_html/mastering/index.html';
$v14 = '/home4/marci955/public_html/mastering/v14.html';

// Delete the file completely (to invalidate any cache)
if(file_exists($new)) {
    // Rename to clear cache
    rename($new, $old);
}
// Copy v14 to index
copy($v14, $new);
// Delete the cache file
if(file_exists($old)) {
    unlink($old);
}
echo "OK";
unlink(__FILE__);
?>