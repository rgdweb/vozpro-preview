<?php
header('Content-Type: application/json; charset=utf-8');
$files = [
    'generate-direct.php',
    'generate.php',
    'generate-omnivoice.php',
];
$results = [];
foreach ($files as $f) {
    $path = __DIR__ . '/' . $f;
    if (!file_exists($path)) {
        $results[$f] = ['exists' => false];
        continue;
    }
    $content = file_get_contents($path);
    $results[$f] = [
        'exists' => true,
        'size' => strlen($content),
        'has_fixPortuguesePronunciation' => strpos($content, 'fixPortuguesePronunciation') !== false,
        'has_ezatamente' => strpos($content, 'ezatamente') !== false,
        'has_call' => strpos($content, 'fixPortuguesePronunciation($texto)') !== false,
        'has_corrupted_dict' => strpos($content, 'ekssatamente') !== false,
        'has_cleanText' => strpos($content, 'cleanText($texto)') !== false,
        'has_stripSSML' => strpos($content, 'stripSSML($texto)') !== false,
        'has_CURLOPT_ENCODING' => strpos($content, "CURLOPT_ENCODING => ''") !== false,
    ];
}
echo json_encode($results, JSON_PRETTY_PRINT);
?>
