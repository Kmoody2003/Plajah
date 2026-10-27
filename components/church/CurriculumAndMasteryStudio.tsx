// components/church/CurriculumAndMasteryStudio.tsx
// Universal Curriculum, Google Forms / Google Docs / Word / PDF & Answer-Key → Interactive Tela & Mastery Studio
// Used in Christian Education (ChurchEducation.tsx) and Academia Teacher Studio (TeacherToolsView.tsx).

import React, { useEffect, useState } from 'react';
import {
  FileText,
  Link2,
  Upload,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Award,
  ExternalLink,
  KeyRound,
  Play,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  GraduationCap,
  FileSpreadsheet,
  Eye,
  FolderOpen,
  HardDrive,
  Columns,
  Layers,
  Palette,
  Sun,
  Gamepad2,
  BookmarkPlus,
  Library,
  Wand2,
} from 'lucide-react';
import {
  ingestCurriculumToTela,
  listIngestedUnits,
  deleteIngestedUnit,
  gradeAndRecordUnitSubmission,
  listUnitSubmissions,
  loadOrgMasterySummary,
  extractLinksFromGoogleDocHub,
  extractLinksFromHtmlOrText,
  extractLinksFromDocxFile,
  batchIngestExtractedLinksToTela,
  ensureAllDetectedLinksOnboarded,
  updateUnitLivingTemplate,
  REVELATION_2_COURSE_CONNECTION_PRESET,
  type IngestedCurriculumUnit,
  type StudentUnitSubmission,
  type CourseHubLinkExtractionResult,
  type ExtractedCourseResourceLink,
} from '../../services/curriculumIngestionService';
import {
  LIVING_WORKSHEET_TEMPLATES,
  LIVING_TEST_QUIZ_TEMPLATES,
  CONTEMPORARY_STANDARD_TEMPLATES,
  ARTISTIC_LIVING_TEMPLATES,
  ALL_LIVING_DOCUMENT_TEMPLATES,
  DEFAULT_LIVING_TEMPLATE_ID,
  DEFAULT_LIVING_TEMPLATE,
  getLivingTemplateById,
  getDefaultLivingTemplateForUnit,
  type LivingDocumentTemplate,
} from '../../services/council/livingDocumentTemplates';
import {
  matchSacredLibrarySupplementsForLesson,
  type SacredLibrarySupplementItem,
} from '../../services/sacredLibraryCurriculumBridge';
import { pinResearchSource } from '../../services/sacredResearch';
import { LEVEL_NAME, LEVEL_COLOR, type SkillLevel } from '../../services/mastery';
import { openScripture } from '../scripture/ScriptureRefChip';
import { parseRef } from '../../services/scriptureRef';
import type { ChurchProgram } from '../../services/churchEducationService';
import {
  GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  GREAT_FAITH_MINISTRIES_NAME,
} from '../../services/orgAssets';
import { TelaDocumentPreviewModal, type TelaDocumentPreviewProps } from './TelaDocumentPreviewModal';
import { HqFilesTab } from '../ContentHQ';
import { LivingTemplateBespokeRenderer } from '../desk/LivingTemplateBespokeRenderer';
import { AssignToClassModal } from '../desk/AssignToClassModal';
import { UniversalStudentDesk } from '../desk/UniversalStudentDesk';

interface CurriculumAndMasteryStudioProps {
  orgId: string;
  orgName: string;
  canEdit: boolean;
  currentUserUid?: string;
  currentUserName?: string;
  programs?: ChurchProgram[];
  selectedProgramId?: string;
  onAttachWeeksToProgram?: (programId: string, unit: IngestedCurriculumUnit) => Promise<void>;
}

const SAMPLE_GOOGLE_DOC_LESSON = `# Romans 8: Life in the Spirit & Christian Assurance
Week 1: No Condemnation in Christ (Romans 8:1-11)
In Romans 8, the Apostle Paul contrasts walking according to the flesh with walking according to the Spirit. Because of Christ's redemptive work, believers are freed from condemnation and indwelt by the Spirit of life.

Week 2: Adoption & Future Glory (Romans 8:12-25)
Believers receive the Spirit of adoption by whom we cry "Abba! Father!" Even as creation groans in eager expectation, the Spirit intercedes for the saints according to the will of God (Romans 8:26-39).

1. According to Romans 8:1, what is the standing of those who are in Christ Jesus? [2 pts]
A) Under partial probation until proven worthy
B) There is now no condemnation for those who are in Christ Jesus
C) Justified by keeping ceremonial observances
D) Left to overcome the flesh by human willpower alone

2. In Romans 8:15, what spirit have believers received, and what cry does it produce? [2 pts]
A) A spirit of fear unto bondage
B) The Spirit of adoption as sons and daughters, by whom we cry, "Abba! Father!"
C) A spirit of philosophical stoicism
D) A spirit of earthly kingship

3. True or False: According to Romans 8:26, the Spirit helps us in our weakness and intercedes for us when we do not know how to pray as we ought. [1 pt]

4. Short Reflection: Read Romans 8:38-39. Name two things Paul declares cannot separate us from the love of God in Christ Jesus our Lord. [3 pts]`;

const SAMPLE_ANSWER_KEY_DOC = `1. B — Romans 8:1 explicitly declares "There is therefore now no condemnation to them which are in Christ Jesus." [2 pts]
2. B — Believers receive the Spirit of adoption ("Abba, Father") rather than a spirit of slavery to fear (Romans 8:15). [2 pts]
3. True — The Spirit Himself intercedes for us with groanings too deep for words (Romans 8:26). [1 pt]
4. Death or life — Neither death nor life, nor angels nor rulers, nor things present nor things to come, nor height nor depth can separate us from God's love in Christ (Romans 8:38-39). [3 pts]`;

export const CurriculumAndMasteryStudio: React.FC<CurriculumAndMasteryStudioProps> = ({
  orgId: rawOrgId,
  orgName: rawOrgName,
  canEdit,
  currentUserUid = 'student_great_faith',
  currentUserName = 'Class Member',
  programs = [],
  selectedProgramId,
  onAttachWeeksToProgram,
}) => {
  // Strictly route to Great Faith Ministries (never demo-grace-chapel)
  const orgId =
    !rawOrgId || rawOrgId === 'demo-grace-chapel' || rawOrgId.startsWith('demo-')
      ? GREAT_FAITH_MINISTRIES_DEFAULT_ID
      : rawOrgId;
  const orgName =
    !rawOrgName || rawOrgName.toLowerCase().includes('grace chapel') || rawOrgName.toLowerCase().includes('demo')
      ? GREAT_FAITH_MINISTRIES_NAME
      : rawOrgName;

  const [sourceTab, setSourceTab] = useState<'HUB_CRAWLER' | 'LINKS' | 'FILES' | 'PASTE' | 'ORG_ASSETS'>('HUB_CRAWLER');
  const [unitTitle, setUnitTitle] = useState('');
  const [unitKind, setUnitKind] = useState<IngestedCurriculumUnit['kind']>('INTERACTIVE_LESSON');
  const [targetProgramId, setTargetProgramId] = useState<string>(selectedProgramId || programs[0]?.id || '');

  // Master Google Doc Hub Crawler state (pre-seeded with Revelation 2: Course Connection)
  const [hubDocUrl, setHubDocUrl] = useState(
    'https://docs.google.com/document/d/1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE/edit?pli=1&tab=t.qo6bykb5zkh7'
  );
  const [crawlingHub, setCrawlingHub] = useState(false);
  const [hubResult, setHubResult] = useState<CourseHubLinkExtractionResult | null>(
    REVELATION_2_COURSE_CONNECTION_PRESET
  );
  const [hubRestrictedNotice, setHubRestrictedNotice] = useState<string>('');
  const [batchProgress, setBatchProgress] = useState<string>('');

  // Link inputs (Google Form / Google Doc / Word Online + Companion Answer Key Doc link)
  const [lessonUrl, setLessonUrl] = useState('');
  const [answerKeyUrl, setAnswerKeyUrl] = useState('');

  // File inputs (PDF, Word .docx, Image scan, TXT/MD)
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);

  // Paste / direct edit inputs
  const [lessonText, setLessonText] = useState('');
  const [answerKeyText, setAnswerKeyText] = useState('');

  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  const [units, setUnits] = useState<IngestedCurriculumUnit[]>(() => listIngestedUnits(orgId));
  const [activeUnit, setActiveUnit] = useState<IngestedCurriculumUnit | null>(() => listIngestedUnits(orgId)[0] || null);
  const [showAnswerKeyInRunner, setShowAnswerKeyInRunner] = useState(false);

  // Interactive Tela Document Preview Modal state (Split View: Original + Tela Document)
  const [telaPreviewModal, setTelaPreviewModal] = useState<Omit<TelaDocumentPreviewProps, 'isOpen' | 'onClose'> | null>(null);

  // Living Worksheet & Test/Quiz Design Studio state (10 Contemporary Standard + 10 Artistic Living = 20 Total)
  const [templateGalleryFilter, setTemplateGalleryFilter] = useState<
    'ALL' | 'CONTEMPORARY' | 'ARTISTIC' | 'WORKSHEET' | 'TEST_QUIZ'
  >('ALL');
  const [showCouncilNotesInStudio, setShowCouncilNotesInStudio] = useState(true);
  const [preferredBuilderTemplateId, setPreferredBuilderTemplateId] = useState<string>(
    DEFAULT_LIVING_TEMPLATE_ID
  );

  // Sacred Library Supplemental Material state
  const [expandedSupplementId, setExpandedSupplementId] = useState<string | null>(null);
  const [pinnedSupplementIds, setPinnedSupplementIds] = useState<Record<string, boolean>>({});

  // Digital Classroom Assignment & Universal Student Desk state
  const [assignModalUnit, setAssignModalUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [showEmbeddedStudentDesk, setShowEmbeddedStudentDesk] = useState<boolean>(false);
  const [assignedToDeskId, setAssignedToDeskId] = useState<string>('');

  // Student interactive response state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastSubmission, setLastSubmission] = useState<StudentUnitSubmission | null>(null);
  const [submissions, setSubmissions] = useState<StudentUnitSubmission[]>(() => listUnitSubmissions(orgId));
  const [masteryMap, setMasteryMap] = useState(() => loadOrgMasterySummary(orgId));

  useEffect(() => {
    const loaded = listIngestedUnits(orgId);
    setUnits(loaded);
    if (loaded.length > 0 && !activeUnit) setActiveUnit(loaded[0]);
    setSubmissions(listUnitSubmissions(orgId));
    setMasteryMap(loadOrgMasterySummary(orgId));
  }, [orgId]);

  // Automatically bring ALL 9 detected documents from Revelation 2: Course Connection onboard
  // into Great Faith Ministries -> Christian Education (and upgrade any older cached units)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await ensureAllDetectedLinksOnboarded(orgId, targetProgramId || undefined);
        if (cancelled) return;
        setUnits(refreshed);
        setActiveUnit(prev => {
          if (prev) {
            const updatedPrev = refreshed.find(u => u.id === prev.id || u.title === prev.title);
            if (updatedPrev) return updatedPrev;
          }
          return refreshed[0] || null;
        });
        setMasteryMap(loadOrgMasterySummary(orgId, targetProgramId || undefined));
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedProgramId) setTargetProgramId(selectedProgramId);
  }, [selectedProgramId]);

  const activeTemplate: LivingDocumentTemplate = React.useMemo(() => {
    if (preferredBuilderTemplateId) {
      return getLivingTemplateById(preferredBuilderTemplateId);
    }
    if (activeUnit?.livingTemplateId) {
      return getLivingTemplateById(activeUnit.livingTemplateId);
    }
    if (activeUnit) {
      return getDefaultLivingTemplateForUnit(activeUnit.kind, activeUnit.title);
    }
    return DEFAULT_LIVING_TEMPLATE;
  }, [activeUnit, preferredBuilderTemplateId]);

  const activeSupplements: SacredLibrarySupplementItem[] = React.useMemo(() => {
    if (!activeUnit) return [];
    if (activeUnit.sacredLibrarySupplements && activeUnit.sacredLibrarySupplements.length > 0) {
      return activeUnit.sacredLibrarySupplements;
    }
    return matchSacredLibrarySupplementsForLesson({
      title: activeUnit.title,
      lessonText: activeUnit.rawCurriculumText || activeUnit.subtitle,
      scripturePassages: activeUnit.lessonBlocks.map(b => b.scripturePassage || '').filter(Boolean),
      maxItems: 4,
    });
  }, [activeUnit]);

  const handleSelectLivingTemplate = (tpl: LivingDocumentTemplate) => {
    setPreferredBuilderTemplateId(tpl.id);
    if (activeUnit) {
      updateUnitLivingTemplate(orgId, activeUnit.id, tpl.id);
      const refreshed = listIngestedUnits(orgId);
      setUnits(refreshed);
      const updated = refreshed.find(u => u.id === activeUnit.id);
      if (updated) setActiveUnit(updated);
      setSuccessBanner(
        `Applied Living ${tpl.category === 'WORKSHEET' ? 'Worksheet' : 'Test & Quiz'} Design "${tpl.name}" (${tpl.councils.artCouncil.memberLabel} + ${tpl.councils.lightingDirector.technique}) to "${activeUnit.title}"!`
      );
    }
  };

  const handleBuildYourOwnWithTemplate = (tpl: LivingDocumentTemplate) => {
    setPreferredBuilderTemplateId(tpl.id);
    setUnitKind(tpl.category === 'TEST_QUIZ' ? 'QUIZ' : 'INTERACTIVE_LESSON');
    setSourceTab('PASTE');
    if (!lessonText.trim()) {
      setUnitTitle(`${tpl.name} — Custom Interactive Study`);
      setLessonText(SAMPLE_GOOGLE_DOC_LESSON);
      setAnswerKeyText(SAMPLE_ANSWER_KEY_DOC);
    }
    setSuccessBanner(
      `Loaded "${tpl.name}" into the Interactive Builder! Paste your Google Doc/Form or upload a PDF/Word file below to build your own with this Living Design.`
    );
  };

  const handlePinSupplementToNotebook = (sup: SacredLibrarySupplementItem) => {
    try {
      pinResearchSource({
        title: `${sup.title} (${sup.dateOrEra})`,
        category: sup.categoryLabel,
        summary: `${sup.relevanceToLesson} — "${sup.excerpt}"`,
        ref: sup.scriptureAnchors[0],
      });
      setPinnedSupplementIds(prev => ({ ...prev, [sup.id]: true }));
    } catch {
      setPinnedSupplementIds(prev => ({ ...prev, [sup.id]: true }));
    }
  };

  const handleLoadSampleGoogleDocs = () => {
    setUnitTitle('Romans 8: Life in the Spirit (Google Form + Answer Doc Demo)');
    setUnitKind('INTERACTIVE_LESSON');
    setLessonText(SAMPLE_GOOGLE_DOC_LESSON);
    setAnswerKeyText(SAMPLE_ANSWER_KEY_DOC);
    setSourceTab('PASTE');
  };

  const handleCrawlHubDoc = async () => {
    if (!hubDocUrl.trim()) {
      setError('Paste a Master Google Doc / Syllabus URL first.');
      return;
    }
    setError('');
    setSuccessBanner('');
    setHubRestrictedNotice('');
    setCrawlingHub(true);
    try {
      const res = await extractLinksFromGoogleDocHub(hubDocUrl.trim());
      if (res.links.length === 0) {
        setHubRestrictedNotice(
          'Connected to Google Doc, but no external <a href> links were found in this tab. You can also press Ctrl+A → Ctrl+C inside your open Google Doc tab and press Ctrl+V in the Rich Clipboard Extractor below!'
        );
      } else {
        setHubResult(res);
        setSuccessBanner(
          `Extracted ${res.links.length} links (${res.pdfLinks.length} PDFs, ${res.googleDocLinks.length} Google Docs, ${res.googleFormLinks.length} Google Forms, ${res.answerKeyLinks.length} Answer Keys) from "${res.hubTitle}"!`
        );
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('RESTRICTED_GOOGLE_DOC') || msg.includes('privacy')) {
        setHubRestrictedNotice(
          'Your Google Doc is currently set to Restricted (HTTP 401). Either set Google Drive sharing to "Anyone with the link → Viewer" and click Crawl again, OR simply press Ctrl+A → Ctrl+C inside your open Google Doc browser tab and press Ctrl+V in the Rich Clipboard Box below to pull every PDF & Google Doc hyperlink directly from your clipboard!'
        );
        // Keep Revelation 2 preset visible if matching docId so user can also test batch Tela conversion immediately
        if (hubDocUrl.includes('1xYj7W8eXhHrOijZOlv55sywrjvB3iSg70NAG9fBu3VE')) {
          setHubResult(REVELATION_2_COURSE_CONNECTION_PRESET);
        }
      } else {
        setError(msg || 'Failed to crawl Google Doc hub links.');
      }
    } finally {
      setCrawlingHub(false);
    }
  };

  const handleRichPasteFromGoogleDoc = (e: React.ClipboardEvent<HTMLDivElement | HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (!html && !plain) return;
    e.preventDefault();
    const extracted = extractLinksFromHtmlOrText(
      html || plain,
      'Revelation 2: Course Connection (Clipboard Extract)',
      hubDocUrl.trim() || undefined
    );
    setHubResult(extracted);
    setHubRestrictedNotice('');
    setError('');
    setSuccessBanner(
      `Extracted ${extracted.links.length} embedded links (${extracted.pdfLinks.length} PDFs, ${extracted.googleDocLinks.length} Google Docs, ${extracted.googleFormLinks.length} Forms, ${extracted.answerKeyLinks.length} Answer Keys) directly from your Google Doc clipboard!`
    );
  };

  const handleExtractLinksFromDocxOrHtmlFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    setHubRestrictedNotice('');
    setCrawlingHub(true);
    try {
      const lower = file.name.toLowerCase();
      let res: CourseHubLinkExtractionResult;
      if (lower.endsWith('.docx')) {
        res = await extractLinksFromDocxFile(file);
      } else {
        const text = await file.text();
        res = extractLinksFromHtmlOrText(text, file.name.replace(/\.(html?|txt|md)$/i, ''));
      }
      setHubResult(res);
      setSuccessBanner(
        `Extracted ${res.links.length} links (${res.pdfLinks.length} PDFs, ${res.googleDocLinks.length} Google Docs, ${res.answerKeyLinks.length} Answer Keys) from ${file.name}!`
      );
    } catch (e: any) {
      setError(e?.message || 'Could not extract links from uploaded file.');
    } finally {
      setCrawlingHub(false);
    }
  };

  const handleUseSingleExtractedLink = (item: ExtractedCourseResourceLink) => {
    setUnitTitle(item.label);
    setLessonUrl(item.url);
    if (item.pairedAnswerKeyUrl) setAnswerKeyUrl(item.pairedAnswerKeyUrl);
    if (item.fallbackCurriculumText) setLessonText(item.fallbackCurriculumText);
    if (item.fallbackAnswerKeyText) setAnswerKeyText(item.fallbackAnswerKeyText);
    setSourceTab(item.fallbackCurriculumText ? 'PASTE' : 'LINKS');
  };

  // Preview any extracted link directly as an Interactive Multi-Frame Tela Document (and ensure Original + Tela versions are in Great Faith Ministries -> Christian Education)
  const handlePreviewExtractedLinkAsTela = async (item: ExtractedCourseResourceLink) => {
    // Check if an ingested unit already exists for this link
    const existing = units.find(
      (u) => u.sourceUrl === item.url || u.title.toLowerCase() === item.label.toLowerCase()
    );
    if (existing) {
      setActiveUnit(existing);
      setTelaPreviewModal({
        title: existing.title,
        telaDocId: existing.telaDocId,
        unit: existing,
        originalUrl: existing.sourceUrl || item.url,
        originalText: existing.rawCurriculumText || item.fallbackCurriculumText,
        answerKeyText: existing.rawAnswerKeyText || item.fallbackAnswerKeyText,
        orgName,
        departmentFolder: existing.departmentFolder || 'Christian Education',
        onOpenFullTelaStudio: handleOpenInTela,
      });
      return;
    }

    setIngesting(true);
    setError('');
    try {
      const { unit, telaDoc } = await ingestCurriculumToTela({
        orgId,
        programId: targetProgramId || undefined,
        title: item.label,
        unitKind:
          item.category === 'GOOGLE_FORM'
            ? item.label.toLowerCase().includes('exam') || item.label.toLowerCase().includes('mastery')
              ? 'TEST'
              : 'QUIZ'
            : item.category === 'PDF_DOCUMENT'
            ? 'INTERACTIVE_LESSON'
            : 'ASSIGNMENT',
        lessonUrl: item.url,
        lessonText: item.fallbackCurriculumText,
        answerKeyUrl: item.pairedAnswerKeyUrl,
        answerKeyText: item.fallbackAnswerKeyText,
        livingTemplateId: preferredBuilderTemplateId || undefined,
      });
      const refreshed = listIngestedUnits(orgId);
      setUnits(refreshed);
      setActiveUnit(unit);
      setSuccessBanner(
        `Copied Original Document + Interactive Tela Document "${unit.title}" to ${orgName} → Org Assets → Christian Education!`
      );
      setTelaPreviewModal({
        title: unit.title,
        telaDoc,
        telaDocId: unit.telaDocId,
        unit,
        originalUrl: unit.sourceUrl || item.url,
        originalText: unit.rawCurriculumText || item.fallbackCurriculumText,
        answerKeyText: unit.rawAnswerKeyText || item.fallbackAnswerKeyText,
        orgName,
        departmentFolder: unit.departmentFolder || 'Christian Education',
        onOpenFullTelaStudio: handleOpenInTela,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not build Tela Document preview.');
    } finally {
      setIngesting(false);
    }
  };

  const handlePreviewUnitAsTela = (u: IngestedCurriculumUnit) => {
    setTelaPreviewModal({
      title: u.title,
      telaDocId: u.telaDocId,
      unit: u,
      originalUrl: u.sourceUrl,
      originalText: u.rawCurriculumText,
      answerKeyText: u.rawAnswerKeyText,
      orgName,
      departmentFolder: u.departmentFolder || 'Christian Education',
      onOpenFullTelaStudio: handleOpenInTela,
    });
  };

  const handleBatchBuildAllExtractedLinks = async () => {
    if (!hubResult || hubResult.links.length === 0) return;
    setError('');
    setSuccessBanner('');
    setIngesting(true);
    try {
      const builtList = await batchIngestExtractedLinksToTela({
        orgId,
        programId: targetProgramId || undefined,
        links: hubResult.links,
        onProgress: (curr, total, label) => {
          setBatchProgress(`Building Tela Unit & Copying to ${orgName} / Christian Education (${curr}/${total}): ${label}...`);
        },
      });
      if (targetProgramId && onAttachWeeksToProgram) {
        for (const b of builtList) {
          await onAttachWeeksToProgram(targetProgramId, b.unit);
        }
      }
      const refreshed = listIngestedUnits(orgId);
      setUnits(refreshed);
      if (builtList[0]) {
        setActiveUnit(builtList[0].unit);
        setAnswers({});
        setLastSubmission(null);
      }
      setMasteryMap(loadOrgMasterySummary(orgId, targetProgramId || undefined));
      setSuccessBanner(
        `Batch-built ${builtList.length} interactive Tela documents & copied BOTH Original + Tela Document versions into ${orgName} → Org Assets (Content HQ) → Christian Education folder!`
      );
    } catch (e: any) {
      setError(e?.message || 'Batch Tela conversion failed.');
    } finally {
      setBatchProgress('');
      setIngesting(false);
    }
  };

  const handleIngest = async () => {
    setError('');
    setSuccessBanner('');
    if (!lessonFile && !lessonUrl.trim() && !lessonText.trim()) {
      setError('Provide a Google Form/Doc link, upload a PDF/Word/Image file, or paste curriculum text.');
      return;
    }
    setIngesting(true);
    try {
      const { unit, telaDoc } = await ingestCurriculumToTela({
        orgId,
        programId: targetProgramId || undefined,
        title: unitTitle.trim() || undefined,
        unitKind,
        lessonFile,
        lessonUrl: lessonUrl.trim() || undefined,
        lessonText: lessonText.trim() || undefined,
        answerKeyFile,
        answerKeyUrl: answerKeyUrl.trim() || undefined,
        answerKeyText: answerKeyText.trim() || undefined,
        livingTemplateId: preferredBuilderTemplateId || undefined,
      });

      if (targetProgramId && onAttachWeeksToProgram) {
        await onAttachWeeksToProgram(targetProgramId, unit);
      }

      const refreshed = listIngestedUnits(orgId);
      setUnits(refreshed);
      setActiveUnit(unit);
      setAnswers({});
      setLastSubmission(null);
      setLessonFile(null);
      setAnswerKeyFile(null);
      setSuccessBanner(
        `Created interactive Tela document "${telaDoc.title}" AND copied both the Original Document + Tela Document version to ${orgName} → Org Assets → Christian Education!`
      );
      setTelaPreviewModal({
        title: unit.title,
        telaDoc,
        telaDocId: unit.telaDocId,
        unit,
        originalUrl: unit.sourceUrl,
        originalText: unit.rawCurriculumText,
        answerKeyText: unit.rawAnswerKeyText,
        orgName,
        departmentFolder: unit.departmentFolder || 'Christian Education',
        onOpenFullTelaStudio: handleOpenInTela,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to parse curriculum and build interactive Tela document.');
    } finally {
      setIngesting(false);
    }
  };

  const handleOpenInTela = (telaDocId: string) => {
    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: telaDocId } }));
  };

  const handleSubmitInteractiveWork = () => {
    if (!activeUnit) return;
    const sub = gradeAndRecordUnitSubmission({
      unit: activeUnit,
      studentUid: currentUserUid,
      studentName: currentUserName,
      answers,
    });
    setLastSubmission(sub);
    setSubmissions(listUnitSubmissions(orgId));
    setMasteryMap(loadOrgMasterySummary(orgId, activeUnit.programId));
  };

  return (
    <div className="space-y-6 text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header Banner */}
      <div className="rounded-3xl border border-purple-500/30 bg-gradient-to-r from-[#6B0099]/25 via-[#D40055]/15 to-[#FF8C00]/15 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
              <Sparkles size={12} /> Powered by Tela &amp; Plajah Mastery Graph
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[10px] font-black text-emerald-200">
              <FolderOpen size={11} /> Auto-Copies Original + Tela Doc → {orgName} · 🎓 Christian Education
            </span>
          </div>
          <h3 className="text-xl font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Google Forms, Google Docs, Word &amp; PDF → Interactive Tela Extractor
          </h3>
          <p className="text-xs text-white/70 leading-relaxed">
            Extract any lesson document, Google Form quiz, Word <code className="text-amber-200">.docx</code>, or PDF alongside its companion <strong>Answer Key Doc</strong>. Every document automatically copies <strong>both the Original Document and the Interactive Tela Document version</strong> into <strong>{orgName}</strong>&apos;s Organization Assets Management System (<code className="text-emerald-300">Content HQ → Christian Education</code> folder scope).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowEmbeddedStudentDesk(v => !v)}
            className={`px-4 py-2.5 rounded-full text-xs font-black inline-flex items-center gap-1.5 shadow-lg transition ${
              showEmbeddedStudentDesk
                ? 'bg-amber-400 text-black'
                : 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white hover:opacity-95'
            }`}
          >
            <GraduationCap size={14} />{' '}
            {showEmbeddedStudentDesk ? '← Back to Curriculum Extractor Studio' : '🪑 Open Universal Student Desk'}
          </button>
          <button
            type="button"
            onClick={() => setSourceTab('ORG_ASSETS')}
            className="px-4 py-2.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-black text-emerald-200 inline-flex items-center gap-1.5"
          >
            <HardDrive size={13} /> Open {orgName} · Christian Education Assets
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleLoadSampleGoogleDocs}
              className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-black text-amber-200 inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} /> Load Sample Lesson + Answer Doc
            </button>
          )}
        </div>
      </div>

      {/* Embedded Universal Student Desk View */}
      {showEmbeddedStudentDesk && (
        <div className="rounded-3xl border border-amber-400/35 bg-black/55 p-4 sm:p-5 shadow-2xl">
          <UniversalStudentDesk
            studentUid={currentUserUid}
            studentName={currentUserName}
            defaultDomain="ALL"
            orgId={orgId}
            orgName={orgName}
            initialAssignmentId={assignedToDeskId || undefined}
            onBack={() => setShowEmbeddedStudentDesk(false)}
            onOpenTelaStudio={handleOpenInTela}
          />
        </div>
      )}

      {/* Ingestion Builder Card (For Teachers / Admins / Org Leaders) */}
      {canEdit && (
        <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSourceTab('HUB_CRAWLER')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  sourceTab === 'HUB_CRAWLER'
                    ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <Sparkles size={13} /> 1. Crawl Google Doc for All PDF &amp; Doc Links
              </button>
              <button
                type="button"
                onClick={() => setSourceTab('LINKS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  sourceTab === 'LINKS'
                    ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <Link2 size={13} /> 2. Single Google Form / Doc Link
              </button>
              <button
                type="button"
                onClick={() => setSourceTab('FILES')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  sourceTab === 'FILES'
                    ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <Upload size={13} /> 3. Upload PDF, Word (.docx) or Scan
              </button>
              <button
                type="button"
                onClick={() => setSourceTab('PASTE')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  sourceTab === 'PASTE'
                    ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow-lg'
                    : 'bg-white/5 text-white/65 hover:text-white'
                }`}
              >
                <FileText size={13} /> 4. Paste / Edit Lesson &amp; Answer Key
              </button>
              <button
                type="button"
                onClick={() => setSourceTab('ORG_ASSETS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
                  sourceTab === 'ORG_ASSETS'
                    ? 'bg-emerald-500 text-black shadow-lg'
                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25'
                }`}
              >
                <FolderOpen size={13} /> 5. {orgName} · Org Assets (🎓 Christian Education)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Unit type"
                value={unitKind}
                onChange={e => setUnitKind(e.target.value as IngestedCurriculumUnit['kind'])}
                className="bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="INTERACTIVE_LESSON">Interactive Lesson + Check</option>
                <option value="ASSIGNMENT">Interactive Assignment</option>
                <option value="QUIZ">Auto-Graded Quiz</option>
                <option value="TEST">Unit Test / Exam</option>
                <option value="CURRICULUM_MODULE">Full Multi-Week Curriculum</option>
              </select>

              {programs.length > 0 && (
                <select
                  aria-label="Target classroom"
                  value={targetProgramId}
                  onChange={e => setTargetProgramId(e.target.value)}
                  className="bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-amber-200"
                >
                  <option value="">All Classrooms ({orgName})</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>
                      Attach to: {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {sourceTab === 'ORG_ASSETS' ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-black/45 p-4 h-[560px] flex flex-col">
              <HqFilesTab
                scope={{ kind: 'org', id: orgId, label: orgName }}
                canEdit={canEdit}
                defaultFolder="Christian Education"
              />
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">
                    Unit / Assignment / Test Title (optional — auto-detected from doc/form)
                  </label>
                  <input
                    value={unitTitle}
                    onChange={e => setUnitTitle(e.target.value)}
                    placeholder="e.g. Romans 8 Inductive Study & Mastery Check"
                    className="w-full bg-black/45 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-400/60"
                  />
                </div>

                {sourceTab === 'HUB_CRAWLER' && (
                  <div className="sm:col-span-2 space-y-4">
                    <div className="rounded-2xl border border-amber-400/25 bg-black/35 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                          <Sparkles size={14} /> Master Syllabus / Course Connection Google Doc Crawler
                        </div>
                        <span className="text-[10px] font-bold text-white/50">
                          Extracts all embedded PDF links, Google Doc links, Google Form links &amp; Answer Keys → Copies Original + Tela Doc to {orgName} / Christian Education
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          value={hubDocUrl}
                          onChange={e => setHubDocUrl(e.target.value)}
                          placeholder="https://docs.google.com/document/d/.../edit?tab=t.qo6bykb5zkh7"
                          className="flex-1 min-w-[260px] bg-black/55 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={handleCrawlHubDoc}
                          disabled={crawlingHub}
                          className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {crawlingHub ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                          Crawl Google Doc Links
                        </button>
                      </div>

                      {hubRestrictedNotice && (
                        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-1.5">
                          <div className="font-black flex items-center gap-1.5 text-amber-300">
                            <AlertCircle size={14} /> Google Doc Sharing Notice (HTTP 401 Restricted)
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-100/90">{hubRestrictedNotice}</p>
                        </div>
                      )}

                      {/* Rich Clipboard & .docx Link Extractor (Works even when Google Doc is Restricted!) */}
                      <div className="grid md:grid-cols-2 gap-3 pt-1">
                        <div
                          onPaste={handleRichPasteFromGoogleDoc}
                          className="rounded-xl border border-dashed border-purple-400/35 bg-purple-500/[0.06] p-3 space-y-1.5"
                        >
                          <div className="text-[11px] font-black text-purple-200 flex items-center justify-between">
                            <span>Rich Clipboard Link Extractor (Works on Private Docs!)</span>
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-[9px] uppercase">Ctrl+V Here</span>
                          </div>
                          <p className="text-[10px] text-white/60 leading-relaxed">
                            In your open Google Doc tab (e.g. <strong>Revelation 2: Course Connection</strong>), press{' '}
                            <code className="text-amber-200">Ctrl+A</code> then <code className="text-amber-200">Ctrl+C</code>, and press{' '}
                            <code className="text-amber-200">Ctrl+V</code> inside the box below to extract every hyperlinked PDF &amp; Google Doc!
                          </p>
                          <textarea
                            rows={2}
                            onPaste={handleRichPasteFromGoogleDoc}
                            placeholder="Click here and press Ctrl+V (or Cmd+V) after copying from your open Google Doc..."
                            className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-purple-400"
                          />
                        </div>

                        <div className="rounded-xl border border-dashed border-cyan-400/35 bg-cyan-500/[0.06] p-3 space-y-1.5">
                          <div className="text-[11px] font-black text-cyan-200 flex items-center justify-between">
                            <span>Or Upload Downloaded .docx / .html Hub Doc</span>
                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-[9px] uppercase">.docx / .html</span>
                          </div>
                          <p className="text-[10px] text-white/60 leading-relaxed">
                            In Google Docs choose <strong>File → Download → Microsoft Word (.docx)</strong> or <strong>Web Page (.html)</strong> and drop it here to parse all <code className="text-cyan-200">word/_rels/document.xml.rels</code> hyperlinks.
                          </p>
                          <input
                            type="file"
                            accept=".docx,.html,.htm,.txt"
                            onChange={e => handleExtractLinksFromDocxOrHtmlFile(e.target.files?.[0] || null)}
                            className="block w-full text-[11px] text-white/70 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-cyan-400 file:text-black"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Extracted Links Summary & Batch Tela Builder */}
                    {hubResult && (
                      <div className="rounded-2xl border border-white/12 bg-black/40 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                              Extracted Course Connection Links • {hubResult.links.length} Total • Target: {orgName} / Christian Education
                            </div>
                            <h4 className="text-sm font-black text-white">{hubResult.hubTitle}</h4>
                            <div className="flex flex-wrap gap-2 mt-1 text-[10px] font-bold">
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/30">
                                {hubResult.pdfLinks.length} PDF Links
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30">
                                {hubResult.googleDocLinks.length} Google Doc Links
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                                {hubResult.googleFormLinks.length} Google Form Links
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                                {hubResult.answerKeyLinks.length} Answer Key Links
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleBatchBuildAllExtractedLinks}
                            disabled={ingesting || hubResult.links.length === 0}
                            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center gap-2 shadow-lg disabled:opacity-50"
                          >
                            {ingesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {batchProgress || `Batch-Convert All & Copy (Original + Tela) to ${orgName}`}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                          {hubResult.links.map(item => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                      item.category === 'PDF_DOCUMENT'
                                        ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                                        : item.category === 'GOOGLE_DOC'
                                          ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                                          : item.category === 'GOOGLE_FORM'
                                            ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                                            : item.isAnswerKey
                                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                              : 'bg-white/10 text-white/70'
                                    }`}
                                  >
                                    {item.category.replace('_', ' ')}
                                  </span>
                                  <span className="text-xs font-bold text-white truncate">{item.label}</span>
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[9px] font-bold text-emerald-300">
                                    🎓 {orgName} · Christian Education
                                  </span>
                                </div>
                                <div className="text-[10px] text-white/45 truncate font-mono">{item.url}</div>
                                {item.pairedAnswerKeyLabel && (
                                  <div className="text-[10px] text-emerald-300 font-semibold flex items-center gap-1">
                                    <KeyRound size={10} /> Auto-paired Answer Key: {item.pairedAnswerKeyLabel}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white/80 inline-flex items-center gap-1"
                                >
                                  <ExternalLink size={10} /> Open Link
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handlePreviewExtractedLinkAsTela(item)}
                                  disabled={ingesting}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-[10px] font-black text-emerald-200 inline-flex items-center gap-1"
                                >
                                  <Columns size={11} /> Preview as Tela Document
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUseSingleExtractedLink(item)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-[10px] font-black text-amber-200"
                                >
                                  Load into Builder
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {sourceTab === 'LINKS' && (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                        <Link2 size={14} /> Lesson, Worksheet, or Google Form Link
                      </div>
                      <p className="text-[11px] text-white/55">
                        Paste a Google Form link (<code className="text-white/80">docs.google.com/forms/...</code>), Google Doc link (<code className="text-white/80">docs.google.com/document/d/...</code>), or Word Online URL.
                      </p>
                      <input
                        value={lessonUrl}
                        onChange={e => setLessonUrl(e.target.value)}
                        placeholder="https://docs.google.com/forms/d/e/... or https://docs.google.com/document/d/..."
                        className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                        <KeyRound size={14} /> Companion Answer Key Doc Link (Optional)
                      </div>
                      <p className="text-[11px] text-white/55">
                        Have a separate Teacher Answer Key Google Doc? Paste its link here (or paste key text below) to auto-wire expected answers &amp; grading rubrics into Tela.
                      </p>
                      <input
                        value={answerKeyUrl}
                        onChange={e => setAnswerKeyUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/... (Answer Key Doc)"
                        className="w-full bg-black/50 border border-emerald-400/25 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                      />
                    </div>
                  </>
                )}

                {sourceTab === 'FILES' && (
                  <>
                    <div className="rounded-2xl border border-dashed border-white/20 bg-black/30 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                        <Upload size={14} /> Upload Curriculum, PDF, Word (.docx) or Handout Image
                      </div>
                      <p className="text-[11px] text-white/55">
                        Auto-converts PDFs (<code className="text-white/80">.pdf</code>), Word docs (<code className="text-white/80">.docx</code>), scanned worksheets (<code className="text-white/80">.png/.jpg</code>), or Markdown/Text into an interactive Tela document.
                      </p>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,image/*"
                        onChange={e => setLessonFile(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-white/70 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-400 file:text-black hover:file:bg-amber-300"
                      />
                      {lessonFile && (
                        <p className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
                          <Check size={12} /> Ready: {lessonFile.name} ({Math.round(lessonFile.size / 1024)} KB)
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-dashed border-emerald-400/30 bg-emerald-500/[0.04] p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                        <KeyRound size={14} /> Upload Answer Key File (Optional)
                      </div>
                      <p className="text-[11px] text-white/55">
                        Upload the teacher answer key (<code className="text-white/80">.pdf</code>, <code className="text-white/80">.docx</code>, <code className="text-white/80">.txt</code>) to automatically bind answer validations and points to each question.
                      </p>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json"
                        onChange={e => setAnswerKeyFile(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-white/70 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-emerald-400 file:text-black hover:file:bg-emerald-300"
                      />
                      {answerKeyFile && (
                        <p className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
                          <Check size={12} /> Key Ready: {answerKeyFile.name}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {sourceTab === 'PASTE' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                        Lesson / Curriculum / Questions Text (or Pasted Google Form / Doc)
                      </label>
                      <textarea
                        value={lessonText}
                        onChange={e => setLessonText(e.target.value)}
                        rows={8}
                        placeholder={`# Unit Title\nWeek 1: Topic (John 1:1-14)\nLesson notes...\n\n1. Question prompt?\nA) Choice 1\nB) Choice 2\nC) Choice 3`}
                        className="w-full bg-black/50 border border-white/15 rounded-2xl p-3 text-xs text-white font-mono leading-relaxed outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-300">
                        Companion Answer Key &amp; Explanations (1. B, 2. True, etc.)
                      </label>
                      <textarea
                        value={answerKeyText}
                        onChange={e => setAnswerKeyText(e.target.value)}
                        rows={8}
                        placeholder={`1. B — Explanation of why B is correct [2 pts]\n2. True — Scripture reference or rubric note\n3. Grace through faith`}
                        className="w-full bg-black/50 border border-emerald-400/25 rounded-2xl p-3 text-xs text-white font-mono leading-relaxed outline-none focus:border-emerald-400"
                      />
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successBanner && (
                <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{successBanner}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-white/50">
                  Generates: <strong>Frame 1</strong> (Tela Lesson &amp; Scripture Reader) + <strong>Frame 2</strong> (Interactive Student Form &amp; Auto-Graded Base Table) + Copies <strong>Original &amp; Tela Doc</strong> to <strong>{orgName} → Christian Education</strong>.
                </p>
                <button
                  type="button"
                  disabled={ingesting}
                  onClick={handleIngest}
                  className="px-5 py-2.5 rounded-full text-xs font-black text-white shadow-lg inline-flex items-center gap-2 disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                  }}
                >
                  {ingesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {ingesting
                    ? 'Extracting & Copying to Great Faith Ministries...'
                    : `Extract, Preview as Tela & Copy to ${orgName}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Living Worksheet & Test/Quiz Design Studio Gallery (10 Clean Modern Contemporary + 10 Artistic Living = 20 Designs) */}
      <div className="rounded-3xl border border-amber-400/25 bg-gradient-to-br from-[#16111F] via-[#111521] to-[#171219] p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                <Palette size={12} /> 20 Art-Council Designs · 10 Clean Modern Contemporary + 10 Artistic Living
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/35 text-[9px] font-black text-purple-200">
                Art Council × Interactive &amp; Gaming Council × Education Council × Lighting Director
              </span>
            </div>
            <h4 className="text-base font-black text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
              20 Bespoke Architectural Worksheet &amp; Assessment Templates — Contemporary Standard &amp; Living Editions
            </h4>
            <p className="text-[11px] text-white/65">
              Select any of the <strong className="text-white">10 Clean, Modern, Contemporary &amp; Elegant Standard</strong> designs or{' '}
              <strong className="text-amber-300">10 Artistic &amp; Experiential Living</strong> designs below to immediately transform the active worksheet or test.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All 20 Designs (${ALL_LIVING_DOCUMENT_TEMPLATES.length})` },
                {
                  id: 'CONTEMPORARY',
                  label: `✨ 10 Clean Modern Contemporary (${CONTEMPORARY_STANDARD_TEMPLATES.length})`,
                },
                {
                  id: 'ARTISTIC',
                  label: `🎨 10 Artistic Living (${ARTISTIC_LIVING_TEMPLATES.length})`,
                },
                { id: 'WORKSHEET', label: '12 Worksheets' },
                { id: 'TEST_QUIZ', label: '8 Tests & Quizzes' },
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTemplateGalleryFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                  templateGalleryFilter === f.id
                    ? 'bg-amber-400 text-black shadow'
                    : 'bg-white/5 text-white/65 hover:text-white border border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCouncilNotesInStudio(v => !v)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black inline-flex items-center gap-1 border transition ${
                showCouncilNotesInStudio
                  ? 'bg-purple-500/25 border-purple-400/50 text-purple-200'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Sparkles size={11} /> {showCouncilNotesInStudio ? 'Hide 4-Council Chime-In' : 'Show 4-Council Chime-In'}
            </button>
          </div>
        </div>

        {/* 20 Template Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(templateGalleryFilter === 'ALL'
            ? ALL_LIVING_DOCUMENT_TEMPLATES
            : templateGalleryFilter === 'CONTEMPORARY'
            ? CONTEMPORARY_STANDARD_TEMPLATES
            : templateGalleryFilter === 'ARTISTIC'
            ? ARTISTIC_LIVING_TEMPLATES
            : templateGalleryFilter === 'WORKSHEET'
            ? ALL_LIVING_DOCUMENT_TEMPLATES.filter(t => t.category === 'WORKSHEET')
            : ALL_LIVING_DOCUMENT_TEMPLATES.filter(t => t.category === 'TEST_QUIZ')
          ).map(tpl => {
            const isSelected = activeTemplate.id === tpl.id;
            const isLightSurface = tpl.styleFamily === 'CONTEMPORARY_MODERN';
            return (
              <div
                key={tpl.id}
                onClick={() => handleSelectLivingTemplate(tpl)}
                className={`rounded-2xl border p-3 cursor-pointer transition-all flex flex-col justify-between gap-2.5 relative overflow-hidden ${
                  isSelected
                    ? 'border-amber-300 ring-2 ring-amber-400/35 scale-[1.01]'
                    : isLightSurface
                    ? 'border-slate-300 hover:border-slate-400'
                    : 'border-white/12 hover:border-white/30'
                }`}
                style={{
                  background: tpl.surfaceGradient,
                  boxShadow: isSelected ? `0 12px 32px -8px ${tpl.ambientGlowColor}` : undefined,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-75"
                  style={{ background: tpl.lightingOverlay }}
                />
                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isLightSurface
                          ? 'bg-slate-900 text-white border-slate-700'
                          : 'bg-black/50 text-white border-white/15'
                      }`}
                    >
                      {tpl.badgeEmoji} {tpl.category === 'WORKSHEET' ? 'Worksheet' : 'Test / Quiz'}
                    </span>
                    {isSelected && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[8px] font-black uppercase">
                        Active
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-xs font-black leading-snug ${
                      isLightSurface ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {tpl.name}
                  </p>
                  <p
                    className={`text-[10px] line-clamp-2 leading-relaxed ${
                      isLightSurface ? 'text-slate-600' : 'text-white/70'
                    }`}
                  >
                    {tpl.tagline}
                  </p>
                </div>

                <div
                  className={`relative z-10 space-y-1.5 pt-1 border-t ${
                    isLightSurface ? 'border-slate-200' : 'border-white/10'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between text-[9px] font-semibold ${
                      isLightSurface ? 'text-slate-700' : 'text-amber-200/90'
                    }`}
                  >
                    <span className="truncate">{tpl.architectureLabel || tpl.councils.artCouncil.memberLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleBuildYourOwnWithTemplate(tpl);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl border text-[10px] font-black inline-flex items-center justify-center gap-1 transition ${
                      isLightSurface
                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-white'
                        : 'bg-black/55 hover:bg-black/75 border-amber-300/35 text-amber-200'
                    }`}
                  >
                    <Wand2 size={10} /> Build Your Own with This
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4-Council Chime-In Bar for the Active Template */}
        {showCouncilNotesInStudio && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            <div className="rounded-2xl border border-amber-400/25 bg-black/45 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-300">
                <span className="inline-flex items-center gap-1">
                  <Palette size={11} /> Art Director Council
                </span>
                <span className="text-[9px] text-amber-200/80">{activeTemplate.councils.artCouncil.memberLabel}</span>
              </div>
              <p className="text-[11px] text-white/75 leading-relaxed">
                {activeTemplate.councils.artCouncil.note}
              </p>
            </div>

            <div className="rounded-2xl border border-purple-400/25 bg-black/45 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-purple-300">
                <span className="inline-flex items-center gap-1">
                  <Gamepad2 size={11} /> Interactive &amp; Gaming Council
                </span>
                <span className="text-[9px] text-purple-200/80">
                  {activeTemplate.councils.gamingAndInteractiveCouncil.microReward}
                </span>
              </div>
              <p className="text-[11px] text-white/75 leading-relaxed">
                {activeTemplate.councils.gamingAndInteractiveCouncil.note}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/25 bg-black/45 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-300">
                <span className="inline-flex items-center gap-1">
                  <GraduationCap size={11} /> Education Council
                </span>
                <span className="text-[9px] text-emerald-200/80">
                  {activeTemplate.councils.educationCouncil.pedagogyFocus}
                </span>
              </div>
              <p className="text-[11px] text-white/75 leading-relaxed">
                {activeTemplate.councils.educationCouncil.note}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/25 bg-black/45 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-300">
                <span className="inline-flex items-center gap-1">
                  <Sun size={11} /> Lighting Director
                </span>
                <span className="text-[9px] text-cyan-200/80">
                  {activeTemplate.councils.lightingDirector.keyToFillRatio}
                </span>
              </div>
              <p className="text-[11px] text-white/75 leading-relaxed">
                {activeTemplate.councils.lightingDirector.note}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Ingested Units Shelf + Interactive Tela Runner + Mastery Skill Tree */}
      {units.length > 0 && (
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Left Rail: Ingested Interactive Tela Units + Mastery Skill Graph (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                  <FileSpreadsheet size={13} /> All Onboarded Tela Units ({units.length})
                </h4>
                <span className="text-[10px] font-bold text-emerald-300">
                  🎓 {orgName}
                </span>
              </div>
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {units.map(u => {
                  const isSel = activeUnit?.id === u.id;
                  const uTpl = u.livingTemplateId
                    ? getLivingTemplateById(u.livingTemplateId)
                    : getDefaultLivingTemplateForUnit(u.kind, u.title);
                  const supCount = u.sacredLibrarySupplements?.length || 0;
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        setActiveUnit(u);
                        setAnswers({});
                        setLastSubmission(null);
                      }}
                      className={`rounded-2xl border p-3 cursor-pointer transition space-y-2 ${
                        isSel
                          ? 'border-amber-400/60 bg-amber-500/10'
                          : 'border-white/10 bg-black/30 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-white/10 text-[9px] font-black uppercase tracking-wider text-amber-200">
                              {u.kind.replace('_', ' ')} · {u.sourceKind.replace('_', ' ')}
                            </span>
                            <span className="inline-block px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-[9px] font-bold text-purple-200">
                              {uTpl.badgeEmoji} {uTpl.name}
                            </span>
                          </div>
                          <p className="text-xs font-black text-white truncate">{u.title}</p>
                          <p className="text-[11px] text-white/50 mt-0.5">
                            {u.questions.length} Questions · {u.totalPoints} pts · {u.masterySkills.length} Skills
                            {supCount > 0 ? ` · ${supCount} Sacred Library Sources` : ''}
                          </p>
                          <p className="text-[10px] text-emerald-300/90 font-semibold mt-1">
                            ✓ Original + Tela Doc in {orgName} / {u.departmentFolder || 'Christian Education'}
                          </p>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              deleteIngestedUnit(orgId, u.id);
                              const next = listIngestedUnits(orgId);
                              setUnits(next);
                              if (activeUnit?.id === u.id) setActiveUnit(next[0] || null);
                            }}
                            className="text-white/30 hover:text-rose-400 p-1"
                            title="Delete unit"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePreviewUnitAsTela(u);
                          }}
                          className="flex-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-[10px] font-black text-emerald-200 inline-flex items-center justify-center gap-1"
                        >
                          <Columns size={11} /> Preview Tela Doc
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setAssignModalUnit(u);
                            }}
                            className="flex-1 px-2.5 py-1.5 rounded-xl bg-amber-400/25 hover:bg-amber-400/35 border border-amber-300/45 text-[10px] font-black text-amber-200 inline-flex items-center justify-center gap-1"
                          >
                            <GraduationCap size={11} /> Assign → Student Desk
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Organization / Classroom Mastery Skill Tree Card */}
            {activeUnit && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                    <Award size={14} /> Course Mastery Skill Graph
                  </h4>
                  <span className="text-[10px] font-mono text-white/50">
                    {activeUnit.masterySkills.length} Skills
                  </span>
                </div>
                <div className="space-y-2">
                  {activeUnit.masterySkills.map(sk => {
                    const rec = masteryMap[sk.id];
                    const lvl: SkillLevel = rec?.level ?? 0;
                    const pct = (lvl / 4) * 100;
                    return (
                      <div key={sk.id} className="rounded-xl border border-white/10 bg-black/35 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{sk.title}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                            style={{
                              backgroundColor: `${LEVEL_COLOR[lvl]}22`,
                              color: LEVEL_COLOR[lvl],
                              border: `1px solid ${LEVEL_COLOR[lvl]}55`,
                            }}
                          >
                            {LEVEL_NAME[lvl]}
                          </span>
                        </div>
                        {sk.scripturePassage && (
                          <p className="text-[10px] text-amber-200/80">Passage: {sk.scripturePassage}</p>
                        )}
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(8, pct)}%`, background: LEVEL_COLOR[lvl] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Stage: Living Interactive Tela Lesson & Auto-Graded Worksheet Runner (8 cols) */}
          {activeUnit && (
            <div
              className="lg:col-span-8 rounded-3xl border p-5 space-y-5 relative overflow-hidden transition-all duration-500"
              style={{
                background: activeTemplate.surfaceGradient,
                borderColor: activeTemplate.cardBorder,
                boxShadow: `0 20px 60px -15px ${activeTemplate.ambientGlowColor}`,
              }}
            >
              {/* Volumetric Paper-Edge Sheen & Lighting Director Overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-85 transition-opacity duration-700"
                style={{ background: activeTemplate.lightingOverlay }}
              />

              <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow"
                      style={{ background: activeTemplate.accentGradient, color: '#0B0B10' }}
                    >
                      {activeTemplate.badgeEmoji} {activeTemplate.name}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[10px] font-black uppercase">
                      🎓 {orgName} · {activeUnit.departmentFolder || 'Christian Education'}
                    </span>
                    {activeUnit.answerKeySourceLabel && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200 text-[10px] font-black uppercase">
                        Answer Key Linked: {activeUnit.answerKeySourceLabel}
                      </span>
                    )}
                  </div>
                  <h3
                    className="text-lg font-black text-white"
                    style={{ fontFamily: activeTemplate.headingFont }}
                  >
                    {activeUnit.title}
                  </h3>
                  <p className="text-xs text-white/65">{activeUnit.subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setAssignModalUnit(activeUnit)}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg"
                    >
                      <GraduationCap size={13} /> Assign to Class → Student Desk
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePreviewUnitAsTela(activeUnit)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <Columns size={13} /> Preview as Tela Document (Original + Tela)
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAnswerKeyInRunner(v => !v)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                        showAnswerKeyInRunner
                          ? 'bg-emerald-400 text-black border-emerald-300'
                          : 'bg-white/5 border-white/15 text-white/75 hover:text-white'
                      }`}
                    >
                      <Eye size={13} /> {showAnswerKeyInRunner ? 'Hide Answer Key' : 'Teacher Answer Key'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenInTela(activeUnit.telaDocId)}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1.5 shadow"
                  >
                    <ExternalLink size={13} /> Open Full Multi-Frame Tela Studio
                  </button>
                </div>
              </div>

              {/* Bespoke Art-Council Architectural Worksheet / Test Canvas */}
              <div className="relative z-10">
                <LivingTemplateBespokeRenderer
                  templateId={activeTemplate.id}
                  unit={activeUnit}
                  answers={answers}
                  onUpdateAnswer={(qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }))}
                  supplements={activeSupplements}
                  isTurnedIn={Boolean(lastSubmission)}
                  submission={lastSubmission}
                  showAnswerKey={showAnswerKeyInRunner || Boolean(lastSubmission)}
                />
              </div>

              {/* Integrated Lorea Sacred Library Supplemental Primary Sources & Archaeological Evidence */}
              {activeSupplements.length > 0 && (
                <div className="relative z-10 rounded-2xl border border-amber-400/30 bg-black/45 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 inline-flex items-center gap-1.5">
                        <Library size={13} /> Lorea Sacred Library · Integrated Primary Sources &amp; Artifacts ({activeSupplements.length})
                      </span>
                    </div>
                    <span className="text-[10px] text-white/55">
                      Ancient Manuscripts, Early Church Fathers &amp; Archaeological Evidence matched to this worksheet
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {activeSupplements.map(sup => {
                      const isExpanded = expandedSupplementId === sup.id;
                      const isPinned = Boolean(pinnedSupplementIds[sup.id]);
                      return (
                        <div
                          key={sup.id}
                          className="rounded-xl border border-white/12 bg-white/[0.04] p-3 space-y-2 flex flex-col justify-between"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span
                                className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                                style={{
                                  backgroundColor: `${sup.accentColor}25`,
                                  color: sup.accentColor,
                                  border: `1px solid ${sup.accentColor}55`,
                                }}
                              >
                                {sup.badgeEmoji} {sup.categoryLabel}
                              </span>
                              <span className="text-[9px] font-mono text-white/55">{sup.dateOrEra}</span>
                            </div>
                            <p className="text-xs font-black text-white">{sup.title}</p>
                            <p className="text-[10px] text-amber-200/85 font-semibold">{sup.subtitle}</p>
                            <p className="text-[11px] text-white/70 leading-relaxed">{sup.relevanceToLesson}</p>

                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-white/10 space-y-2 text-[11px]">
                                <div className="rounded-lg bg-black/50 border border-amber-400/25 p-2.5 text-amber-100/90 italic leading-relaxed">
                                  &ldquo;{sup.excerpt}&rdquo;
                                </div>
                                <div className="rounded-lg bg-purple-500/10 border border-purple-400/25 p-2 text-purple-200">
                                  <strong>Inductive Worksheet Prompt:</strong> {sup.worksheetPrompt}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() => setExpandedSupplementId(isExpanded ? null : sup.id)}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white/85"
                            >
                              {isExpanded ? 'Hide Excerpt & Prompt' : 'Read Primary Source & Prompt'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePinSupplementToNotebook(sup)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 transition ${
                                isPinned
                                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                                  : 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/35'
                              }`}
                            >
                              <BookmarkPlus size={11} />
                              {isPinned ? 'Pinned to Sacred Notebook' : 'Pin to Sacred Notebook'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit & Auto-Grade Bar */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                {lastSubmission ? (
                  <div className="flex items-center gap-3">
                    <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-black">
                      Score: {lastSubmission.earnedPoints}/{lastSubmission.totalPoints} pts ({lastSubmission.percentage}%)
                    </span>
                    <span className="text-xs text-white/65">
                      Mastery skill graph updated for {lastSubmission.studentName}!
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-white/55">
                    Complete the interactive items above and click Check Answers to auto-grade against the Answer Key.
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSubmitInteractiveWork}
                  className="px-5 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg"
                >
                  <CheckCircle2 size={14} /> Check Answers &amp; Update Mastery
                </button>
              </div>

              {/* Tease & Build Your Own With This Living Design Banner */}
              <div className="relative z-10 rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-rose-500/15 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 max-w-xl">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                    <Wand2 size={12} /> Inspired by &ldquo;{activeTemplate.name}&rdquo;?
                  </div>
                  <p className="text-xs text-white/85 leading-relaxed">{activeTemplate.teaserHook}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleBuildYourOwnWithTemplate(activeTemplate)}
                  className="px-4 py-2 rounded-full text-xs font-black text-black shadow-lg inline-flex items-center gap-1.5 shrink-0"
                  style={{ background: activeTemplate.accentGradient }}
                >
                  <Sparkles size={13} /> Build Your Own with &ldquo;{activeTemplate.name}&rdquo;
                </button>
              </div>

              {/* Recent Submissions Table for Teachers */}
              {canEdit && submissions.filter(s => s.unitId === activeUnit.id).length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
                    Recent Auto-Graded Student Submissions ({submissions.filter(s => s.unitId === activeUnit.id).length})
                  </p>
                  <div className="space-y-1.5">
                    {submissions
                      .filter(s => s.unitId === activeUnit.id)
                      .slice(0, 6)
                      .map(s => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-xs"
                        >
                          <span className="font-bold text-white">{s.studentName}</span>
                          <span className="font-mono text-emerald-300 font-bold">
                            {s.earnedPoints}/{s.totalPoints} pts ({s.percentage}%)
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Digital Classroom Assignment Modal (Assigns Unit to Universal Student Desks) */}
      <AssignToClassModal
        isOpen={Boolean(assignModalUnit)}
        onClose={() => setAssignModalUnit(null)}
        unit={assignModalUnit}
        defaultDomain="CHRISTIAN_EDUCATION"
        orgId={orgId}
        orgName={orgName}
        teacherUid={currentUserUid}
        teacherName={currentUserName}
        programs={programs}
        defaultProgramId={targetProgramId}
        onAssigned={created => {
          setAssignedToDeskId(created.id);
          setSuccessBanner(
            `Assigned "${created.title}" to ${created.classroomName}! Students can now open it on their Universal Student Desk.`
          );
        }}
        onOpenStudentDesk={assignmentId => {
          setAssignModalUnit(null);
          setAssignedToDeskId(assignmentId);
          setShowEmbeddedStudentDesk(true);
        }}
      />

      {/* Interactive Tela Document Preview Modal (Original + Multi-Frame Tela Document Split View) */}
      {telaPreviewModal && (
        <TelaDocumentPreviewModal
          isOpen={Boolean(telaPreviewModal)}
          onClose={() => setTelaPreviewModal(null)}
          {...telaPreviewModal}
        />
      )}
    </div>
  );
};

export default CurriculumAndMasteryStudio;
