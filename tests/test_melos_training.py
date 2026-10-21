import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('training', Path(__file__).parents[1] / 'scripts' / 'prepare_melos_training.py')
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)


class TrainingManifestTests(unittest.TestCase):
    def test_versions_are_preserved_and_related_names_share_a_group(self):
        first = training.composition_label('01 - K-Moody - Sacred_Ascension_2026-06-28T022240')
        second = training.composition_label('15 - K-Moody - Sacred_Ascension_2026-06-28T022954-Mastered-File')
        self.assertEqual(first, second)
        self.assertEqual(training.split_for(first), training.split_for(second))

    def test_unreviewed_examples_cannot_be_staged(self):
        with self.assertRaisesRegex(ValueError, 'Review annotations'):
            training.validate_entries({'entries': [{'reviewed': False}]})

    def test_related_versions_cannot_leak_across_splits(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sample.wav'
            path.write_bytes(b'fixture')
            entry = dict(audio=str(path), reviewed=True, compositionId='song', caption='A vocal ballad',
                         bpm=100, keyscale='D minor', vocalType='lead', lyrics='Reviewed lyric', language='en')
            with self.assertRaisesRegex(ValueError, 'Related song versions'):
                training.validate_entries({'entries': [{**entry, 'split': 'train'}, {**entry, 'split': 'test'}]})
            with self.assertRaisesRegex(ValueError, 'distinct composition'):
                training.validate_entries({'entries': [{**entry, 'split': 'train'}]})
            entries = [{**entry, 'compositionId': str(i), 'split': split} for i, split in enumerate(('train', 'validation', 'test'))]
            self.assertEqual(len(training.validate_entries({'entries': entries})), 3)


if __name__ == '__main__':
    unittest.main()
