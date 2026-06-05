<?php
$target = '/home4/marci955/public_html/mastering/index.html';
$source = '/home4/marci955/public_html/mastering/v14.html';
$v12_content = file_get_contents($source);
$result = file_put_contents($target, $v12_content);
if($result !== false) {
    echo "OK: " . $result . " bytes written to index.html";
} else {
    echo "ERROR: " . error_get_last()['message'];
}
unlink(__FILE__);
?>