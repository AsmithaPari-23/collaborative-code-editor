import { executeCode } from '../services/judge0Service.js';

// @desc    Execute code
// @route   POST /api/execute
// @access  Private
export const runCode = async (req, res, next) => {
  const { language, code, input } = req.body;

  if (!language || !code) {
    res.status(400);
    return next(new Error('Language and code content are required for execution'));
  }

  try {
    const result = await executeCode(language, code, input);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
